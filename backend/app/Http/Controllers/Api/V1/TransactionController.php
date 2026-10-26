<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreTransactionRequest;
use App\Models\Customer;
use App\Models\Transaction;
use App\Support\Money;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class TransactionController extends Controller
{
    /**
     * Calculate the exact customer balance in paise.
     * MySQL DECIMAL values remain strings.
     */
    private function balancePaise(int $customerId): int
    {
        $row = DB::table('transactions')
            ->where('customer_id', $customerId)
            ->selectRaw(
                "COALESCE(SUM(CASE
                    WHEN type = 'debit' THEN amount
                    ELSE -amount
                END), 0) AS balance"
            )
            ->first();

        return Money::toPaise(
            $this->decimalString($row->balance)
        );
    }

    /**
     * Normalize a database DECIMAL value without floats.
     */
    private function decimalString(mixed $value): string
    {
        $value = (string) $value;

        if (! preg_match(
            '/^-?\d{1,15}(?:\.\d{1,2})?$/D',
            $value
        )) {
            throw new \RuntimeException(
                'Unexpected database decimal value.'
            );
        }

        $negative = str_starts_with($value, '-');
        $absolute = ltrim($value, '-');

        [$whole, $fraction] = array_pad(
            explode('.', $absolute, 2),
            2,
            ''
        );

        $result = $whole.'.'.str_pad(
            $fraction,
            2,
            '0'
        );

        return $negative ? '-'.$result : $result;
    }

    /**
     * Return debit, credit and outstanding balance.
     */
    private function totals(int $customerId): array
    {
        $row = DB::table('transactions')
            ->where('customer_id', $customerId)
            ->selectRaw(
                "COALESCE(SUM(CASE
                    WHEN type = 'debit' THEN amount
                    ELSE 0
                END), 0) AS total_debit"
            )
            ->selectRaw(
                "COALESCE(SUM(CASE
                    WHEN type = 'credit' THEN amount
                    ELSE 0
                END), 0) AS total_credit"
            )
            ->first();

        $debit = Money::toPaise(
            $this->decimalString($row->total_debit)
        );

        $credit = Money::toPaise(
            $this->decimalString($row->total_credit)
        );

        return [
            'total_debit' => Money::fromPaise($debit),
            'total_credit' => Money::fromPaise($credit),
            'balance' => Money::fromPaise($debit - $credit),
        ];
    }

    /**
     * Compare an existing transaction with a retried request.
     */
    private function matchesRequest(
        Transaction $transaction,
        array $data
    ): bool {
        return $transaction->customer_id ===
                (int) $data['customer_id']
            && $transaction->type === $data['type']
            && Money::toPaise($transaction->amount) ===
                Money::toPaise($data['amount'])
            && $transaction->source === 'manual'
            && $transaction->reversal_of_id === null
            && $transaction->description_en ===
                ($data['description_en'] ?? null)
            && $transaction->description_gu ===
                ($data['description_gu'] ?? null);
    }

    /**
     * Save debit or credit transaction.
     */
    public function store(
        StoreTransactionRequest $request
    ): JsonResponse {
        $data = $request->validated();

        $amount = Money::toPaise($data['amount']);

        if ($amount <= 0) {
            throw ValidationException::withMessages([
                'amount' => [
                    'Amount must be greater than zero.'
                ],
            ]);
        }

        try {
            $result = DB::transaction(
                function () use ($data, $amount, $request) {
                    /*
                     * Lock the customer row so debit,
                     * credit and reversal operations for
                     * this customer are serialized.
                     */
                    $customer = Customer::query()
                        ->whereKey($data['customer_id'])
                        ->where('is_active', true)
                        ->lockForUpdate()
                        ->firstOrFail();

                    $existing = Transaction::query()
                        ->where(
                            'idempotency_key',
                            $data['idempotency_key']
                        )
                        ->first();

                    if ($existing) {
                        if (! $this->matchesRequest(
                            $existing,
                            $data
                        )) {
                            return [
                                'conflict' => true,
                            ];
                        }

                        return [
                            'transaction' => $existing,
                            'replayed' => true,
                        ];
                    }

                    /*
                     * Do not allow a credit to exceed
                     * the customer's current balance.
                     */
                    if (
                        $data['type'] === 'credit'
                        && $amount >
                            $this->balancePaise($customer->id)
                    ) {
                        throw ValidationException::withMessages([
                            'amount' => [
                                'Payment exceeds outstanding balance.'
                            ],
                        ]);
                    }

                    $transaction = Transaction::create([
                        'uuid' => (string) Str::uuid(),
                        'customer_id' => $customer->id,
                        'type' => $data['type'],
                        'amount' => Money::fromPaise($amount),
                        'description_en' =>
                            $data['description_en'] ?? null,
                        'description_gu' =>
                            $data['description_gu'] ?? null,
                        'source' => 'manual',
                        'idempotency_key' =>
                            $data['idempotency_key'],
                        'created_by' => $request->user()->id,
                        'transaction_at' => now(),
                    ]);

                    return [
                        'transaction' => $transaction,
                        'replayed' => false,
                    ];
                },
                3
            );
        } catch (UniqueConstraintViolationException $e) {
            /*
             * Another request may have inserted the
             * same idempotency key concurrently.
             */
            $existing = Transaction::query()
                ->where(
                    'idempotency_key',
                    $data['idempotency_key']
                )
                ->first();

            if (
                $existing
                && $this->matchesRequest($existing, $data)
            ) {
                $result = [
                    'transaction' => $existing,
                    'replayed' => true,
                ];
            } else {
                return response()->json([
                    'success' => false,
                    'message' =>
                        'Idempotency key already used for another entry.',
                ], 409);
            }
        }

        if (isset($result['conflict'])) {
            return response()->json([
                'success' => false,
                'message' =>
                    'Idempotency key already used for another entry.',
            ], 409);
        }

        $transaction = $result['transaction'];

        return response()->json([
            'success' => true,
            'replayed' => $result['replayed'],
            'message' => 'Transaction saved successfully.',
            'data' => $transaction,
            'summary' => $this->totals(
                $transaction->customer_id
            ),
        ], $result['replayed'] ? 200 : 201);
    }

    /**
     * Paginated transaction list.
     */
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_id' => [
                'nullable',
                'integer',
                'exists:customers,id',
            ],
            'from' => [
                'nullable',
                'date_format:Y-m-d',
            ],
            'to' => [
                'nullable',
                'date_format:Y-m-d',
                'after_or_equal:from',
            ],
            'per_page' => [
                'nullable',
                'integer',
                'min:1',
                'max:100',
            ],
        ]);

        $query = Transaction::query()
            ->with([
                'customer:id,name_en,name_gu',
            ]);

        if (isset($data['customer_id'])) {
            $query->where(
                'customer_id',
                $data['customer_id']
            );
        }

        if (isset($data['from'])) {
            $query->whereDate(
                'transaction_at',
                '>=',
                $data['from']
            );
        }

        if (isset($data['to'])) {
            $query->whereDate(
                'transaction_at',
                '<=',
                $data['to']
            );
        }

        $transactions = $query
            ->orderByDesc('transaction_at')
            ->orderByDesc('id')
            ->paginate($data['per_page'] ?? 20);

        return response()->json([
            'success' => true,
            'data' => $transactions,
        ]);
    }

    /**
     * Customer ledger with running balance.
     */
    public function ledger(
        Request $request,
        Customer $customer
    ): JsonResponse {
        $data = $request->validate([
            'per_page' => [
                'nullable',
                'integer',
                'min:1',
                'max:100',
            ],
            'page' => [
                'nullable',
                'integer',
                'min:1',
            ],
        ]);

        /*
         * Running balance is calculated in chronological
         * order. A complete history is needed for correct
         * opening balance.
         */
        $allTransactions = $customer->transactions()
            ->orderBy('transaction_at')
            ->orderBy('id')
            ->get();

        $running = 0;
        $ledger = [];

        foreach ($allTransactions as $transaction) {
            $amount = Money::toPaise(
                $transaction->amount
            );

            if ($transaction->type === 'debit') {
                $running += $amount;
            } else {
                $running -= $amount;
            }

            $ledger[] = [
                'id' => $transaction->id,
                'uuid' => $transaction->uuid,
                'type' => $transaction->type,
                'amount' => $transaction->amount,
                'description_en' =>
                    $transaction->description_en,
                'description_gu' =>
                    $transaction->description_gu,
                'source' => $transaction->source,
                'reversal_of_id' =>
                    $transaction->reversal_of_id,
                'transaction_at' =>
                    $transaction->transaction_at,
                'running_balance' =>
                    Money::fromPaise($running),
            ];
        }

        $perPage = (int) ($data['per_page'] ?? 20);
        $page = (int) ($data['page'] ?? 1);

        $total = count($ledger);

        $items = array_slice(
            $ledger,
            ($page - 1) * $perPage,
            $perPage
        );

        return response()->json([
            'success' => true,
            'customer' => $customer,
            'summary' => $this->totals($customer->id),
            'data' => $items,
            'pagination' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => max(
                    1,
                    (int) ceil($total / $perPage)
                ),
            ],
        ]);
    }

    /**
     * Reverse an existing transaction.
     * Original transaction is never deleted.
     */
    public function reverse(
        Request $request,
        Transaction $transaction
    ): JsonResponse {
        $data = $request->validate([
            'reason' => [
                'required',
                'string',
                'min:3',
                'max:255',
            ],
            'idempotency_key' => [
                'required',
                'uuid',
            ],
        ]);

        try {
            $result = DB::transaction(
                function () use (
                    $transaction,
                    $data,
                    $request
                ) {
                    /*
                     * Serialize reversal operations with
                     * other customer transactions.
                     */
                    Customer::whereKey(
                        $transaction->customer_id
                    )
                        ->lockForUpdate()
                        ->firstOrFail();

                    $existing = Transaction::where(
                        'idempotency_key',
                        $data['idempotency_key']
                    )->first();

                    if ($existing) {
                        if (
                            $existing->reversal_of_id ===
                            $transaction->id
                            && $existing->description_en ===
                                'Reversal: '.$data['reason']
                        ) {
                            return [
                                'transaction' => $existing,
                                'replayed' => true,
                            ];
                        }

                        return [
                            'conflict' => true,
                        ];
                    }

                    if ($transaction->reversal_of_id !== null) {
                        throw ValidationException::withMessages([
                            'transaction' => [
                                'A reversal entry cannot be reversed.'
                            ],
                        ]);
                    }

                    $alreadyReversed = Transaction::query()
                        ->where(
                            'reversal_of_id',
                            $transaction->id
                        )
                        ->exists();

                    if ($alreadyReversed) {
                        throw ValidationException::withMessages([
                            'transaction' => [
                                'This transaction is already reversed.'
                            ],
                        ]);
                    }

                    $reverseType =
                        $transaction->type === 'debit'
                            ? 'credit'
                            : 'debit';

                    $amount = Money::toPaise(
                        $transaction->amount
                    );

                    /*
                     * Reversing a debit removes debt.
                     * Do not create a negative balance.
                     */
                    if (
                        $reverseType === 'credit'
                        && $amount >
                            $this->balancePaise(
                                $transaction->customer_id
                            )
                    ) {
                        throw ValidationException::withMessages([
                            'transaction' => [
                                'Cannot reverse because later payments use this balance.'
                            ],
                        ]);
                    }

                    $reversal = Transaction::create([
                        'uuid' => (string) Str::uuid(),
                        'customer_id' =>
                            $transaction->customer_id,
                        'type' => $reverseType,
                        'amount' => $transaction->amount,
                        'description_en' =>
                            'Reversal: '.$data['reason'],
                        'description_gu' =>
                            'રદ એન્ટ્રી: '.$data['reason'],
                        'source' => 'system',
                        'idempotency_key' =>
                            $data['idempotency_key'],
                        'created_by' => $request->user()->id,
                        'reversal_of_id' => $transaction->id,
                        'transaction_at' => now(),
                    ]);

                    return [
                        'transaction' => $reversal,
                        'replayed' => false,
                    ];
                },
                3
            );
        } catch (UniqueConstraintViolationException $e) {
            $existing = Transaction::where(
                'idempotency_key',
                $data['idempotency_key']
            )->first();

            if (
                $existing
                && $existing->reversal_of_id ===
                    $transaction->id
                && $existing->description_en ===
                    'Reversal: '.$data['reason']
            ) {
                $result = [
                    'transaction' => $existing,
                    'replayed' => true,
                ];
            } else {
                return response()->json([
                    'success' => false,
                    'message' =>
                        'Transaction reversal conflict.',
                ], 409);
            }
        }

        if (isset($result['conflict'])) {
            return response()->json([
                'success' => false,
                'message' =>
                    'Idempotency key conflict.',
            ], 409);
        }

        return response()->json([
            'success' => true,
            'replayed' => $result['replayed'],
            'message' =>
                'Transaction reversed successfully.',
            'data' => $result['transaction'],
            'summary' => $this->totals(
                $transaction->customer_id
            ),
        ], $result['replayed'] ? 200 : 201);
    }
}
