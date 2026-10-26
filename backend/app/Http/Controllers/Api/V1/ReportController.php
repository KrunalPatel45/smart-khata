<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ReportController extends Controller
{
    /**
     * Convert a MySQL DECIMAL result to a normalized
     * money string without using floating-point math.
     */
    private function moneyString(mixed $value): string
    {
        $value = (string) ($value ?? '0');

        if (! preg_match(
            '/^-?\d+(?:\.\d{1,2})?$/D',
            $value
        )) {
            throw new \RuntimeException(
                'Invalid decimal value returned by database.'
            );
        }

        $negative = str_starts_with($value, '-');
        $absolute = ltrim($value, '-');

        [$whole, $fraction] = array_pad(
            explode('.', $absolute, 2),
            2,
            ''
        );

        $whole = ltrim($whole, '0');

        if ($whole === '') {
            $whole = '0';
        }

        $fraction = str_pad(
            $fraction,
            2,
            '0'
        );

        $result = $whole.'.'.$fraction;

        if ($result === '0.00') {
            return '0.00';
        }

        return $negative ? '-'.$result : $result;
    }

    /**
     * Subtract two decimal money strings exactly.
     *
     * Requires PHP with BCMath extension enabled.
     */
    private function subtractMoney(
        string $first,
        string $second
    ): string {
        if (! extension_loaded('bcmath')) {
            throw new \RuntimeException(
                'BCMath PHP extension is required.'
            );
        }

        return bcsub(
            $first,
            $second,
            2
        );
    }

    /**
     * Convert a local date range to UTC boundaries.
     *
     * Start is inclusive.
     * End is exclusive.
     */
    private function dateRange(
        string $from,
        string $to
    ): array {
        $timezone = 'Asia/Kolkata';

        $start = CarbonImmutable::createFromFormat(
            '!Y-m-d',
            $from,
            $timezone
        )->startOfDay();

        $end = CarbonImmutable::createFromFormat(
            '!Y-m-d',
            $to,
            $timezone
        )->addDay()->startOfDay();

        if ($start->greaterThanOrEqualTo($end)) {
            throw ValidationException::withMessages([
                'to' => [
                    'End date must be on or after start date.'
                ],
            ]);
        }

        return [
            $start->utc()->format('Y-m-d H:i:s'),
            $end->utc()->format('Y-m-d H:i:s'),
        ];
    }

    /**
     * Return daily and monthly report data.
     *
     * GET /api/v1/reports/summary
     *
     * Query parameters:
     * from=2026-10-01
     * to=2026-10-31
     */
    public function summary(Request $request): JsonResponse
    {
        $data = $request->validate([
            'from' => [
                'required',
                'date_format:Y-m-d',
            ],
            'to' => [
                'required',
                'date_format:Y-m-d',
                'after_or_equal:from',
            ],
        ]);

        [$startUtc, $endUtc] = $this->dateRange(
            $data['from'],
            $data['to']
        );

        /*
         * All totals are calculated directly from
         * the immutable transaction ledger.
         */
        $totals = DB::table('transactions')
            ->where(
                'transaction_at',
                '>=',
                $startUtc
            )
            ->where(
                'transaction_at',
                '<',
                $endUtc
            )
            ->selectRaw(
                "COALESCE(SUM(
                    CASE
                        WHEN type = 'debit'
                        THEN amount
                        ELSE 0
                    END
                ), 0) AS total_debit"
            )
            ->selectRaw(
                "COALESCE(SUM(
                    CASE
                        WHEN type = 'credit'
                        THEN amount
                        ELSE 0
                    END
                ), 0) AS total_credit"
            )
            ->selectRaw(
                'COUNT(*) AS transaction_count'
            )
            ->first();

        $totalDebit = $this->moneyString(
            $totals->total_debit
        );

        $totalCredit = $this->moneyString(
            $totals->total_credit
        );

        $netChange = $this->subtractMoney(
            $totalDebit,
            $totalCredit
        );

        /*
         * Daily report.
         *
         * MySQL CONVERT_TZ with a numeric offset
         * avoids dependency on installed named
         * timezone tables for Asia/Kolkata.
         */
        $localDateExpression =
            "DATE(CONVERT_TZ(
                transaction_at,
                '+00:00',
                '+05:30'
            ))";

        $dailyRows = DB::table('transactions')
            ->where(
                'transaction_at',
                '>=',
                $startUtc
            )
            ->where(
                'transaction_at',
                '<',
                $endUtc
            )
            ->selectRaw(
                $localDateExpression.' AS report_date'
            )
            ->selectRaw(
                "COALESCE(SUM(
                    CASE
                        WHEN type = 'debit'
                        THEN amount
                        ELSE 0
                    END
                ), 0) AS debit"
            )
            ->selectRaw(
                "COALESCE(SUM(
                    CASE
                        WHEN type = 'credit'
                        THEN amount
                        ELSE 0
                    END
                ), 0) AS credit"
            )
            ->selectRaw(
                'COUNT(*) AS transaction_count'
            )
            ->groupByRaw(
                $localDateExpression
            )
            ->orderBy('report_date')
            ->get();

        $daily = $dailyRows->map(function ($row) {
            $debit = $this->moneyString(
                $row->debit
            );

            $credit = $this->moneyString(
                $row->credit
            );

            return [
                'date' => $row->report_date,
                'debit' => $debit,
                'credit' => $credit,
                'net_change' => $this->subtractMoney(
                    $debit,
                    $credit
                ),
                'transaction_count' =>
                    (int) $row->transaction_count,
            ];
        })->values();

        /*
         * Monthly grouping based on the same
         * Asia/Kolkata local calendar.
         */
        $localMonthExpression =
            "DATE_FORMAT(
                CONVERT_TZ(
                    transaction_at,
                    '+00:00',
                    '+05:30'
                ),
                '%Y-%m'
            )";

        $monthlyRows = DB::table('transactions')
            ->where(
                'transaction_at',
                '>=',
                $startUtc
            )
            ->where(
                'transaction_at',
                '<',
                $endUtc
            )
            ->selectRaw(
                $localMonthExpression.' AS report_month'
            )
            ->selectRaw(
                "COALESCE(SUM(
                    CASE
                        WHEN type = 'debit'
                        THEN amount
                        ELSE 0
                    END
                ), 0) AS debit"
            )
            ->selectRaw(
                "COALESCE(SUM(
                    CASE
                        WHEN type = 'credit'
                        THEN amount
                        ELSE 0
                    END
                ), 0) AS credit"
            )
            ->selectRaw(
                'COUNT(*) AS transaction_count'
            )
            ->groupByRaw(
                $localMonthExpression
            )
            ->orderBy('report_month')
            ->get();

        $monthly = $monthlyRows->map(function ($row) {
            $debit = $this->moneyString(
                $row->debit
            );

            $credit = $this->moneyString(
                $row->credit
            );

            return [
                'month' => $row->report_month,
                'debit' => $debit,
                'credit' => $credit,
                'net_change' => $this->subtractMoney(
                    $debit,
                    $credit
                ),
                'transaction_count' =>
                    (int) $row->transaction_count,
            ];
        })->values();

        /*
         * Overall outstanding is different from
         * the selected period's net change.
         *
         * Calculate it from all transactions.
         */
        $overall = DB::table('transactions')
            ->selectRaw(
                "COALESCE(SUM(
                    CASE
                        WHEN type = 'debit'
                        THEN amount
                        ELSE -amount
                    END
                ), 0) AS outstanding"
            )
            ->first();

        return response()->json([
            'success' => true,

            'period' => [
                'from' => $data['from'],
                'to' => $data['to'],
                'timezone' => 'Asia/Kolkata',
            ],

            'summary' => [
                'total_debit' => $totalDebit,
                'total_credit' => $totalCredit,
                'net_change' => $netChange,
                'transaction_count' =>
                    (int) $totals->transaction_count,
                'overall_outstanding' =>
                    $this->moneyString(
                        $overall->outstanding
                    ),
            ],

            'daily' => $daily,

            'monthly' => $monthly,
        ]);
    }
}
