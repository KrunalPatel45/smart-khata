<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class VoiceEntryController extends Controller
{
    /**
     * Parse voice text into a transaction draft.
     *
     * This endpoint never saves a transaction.
     * The user must confirm the draft first.
     */
    public function parse(Request $request): JsonResponse
    {
        $data = $request->validate([
            'text' => [
                'required',
                'string',
                'min:2',
                'max:1000',
            ],
            'language' => [
                'nullable',
                'in:gu-IN,en-IN',
            ],
        ]);

        $text = trim($data['text']);

        $amount = $this->extractAmount($text);
        $type = $this->extractType($text);

        $matches = $this->matchCustomers($text);

        $customer = count($matches) === 1
            ? $matches[0]
            : null;

        $warnings = [];

        if ($amount === null) {
            $warnings[] = 'Amount could not be identified.';
        }

        if ($type === null) {
            $warnings[] = 'Transaction type could not be identified.';
        }

        if (count($matches) === 0) {
            $warnings[] = 'No matching customer found.';
        }

        if (count($matches) > 1) {
            $warnings[] = 'Multiple customers matched. Please select one.';
        }

        return response()->json([
            'success' => true,
            'message' => 'Voice text parsed successfully.',
            'data' => [
                'original_text' => $text,
                'language' => $data['language'] ?? 'gu-IN',
                'customer' => $customer,
                'customer_matches' => $matches,
                'type' => $type,
                'amount' => $amount,
                'requires_confirmation' => true,
                'warnings' => $warnings,
            ],
        ]);
    }

    /**
     * Extract numeric amount from spoken text.
     *
     * Examples:
     * 500
     * 500.50
     * ₹500
     * 1,500
     * ૫૦૦
     */
    private function extractAmount(string $text): ?string
    {
        $gujaratiDigits = [
            '૦' => '0',
            '૧' => '1',
            '૨' => '2',
            '૩' => '3',
            '૪' => '4',
            '૫' => '5',
            '૬' => '6',
            '૭' => '7',
            '૮' => '8',
            '૯' => '9',
        ];

        $normalized = strtr(
            $text,
            $gujaratiDigits
        );

        $normalized = str_replace(
            [',', '₹'],
            ['', ' '],
            $normalized
        );

        if (! preg_match(
            '/(?<!\d)(\d{1,13}(?:\.\d{1,2})?)(?![\d.])/u',
            $normalized,
            $matches
        )) {
            return null;
        }

        $value = $matches[1];

        [$rupees, $paise] = array_pad(
            explode('.', $value, 2),
            2,
            ''
        );

        $rupees = ltrim($rupees, '0');

        if ($rupees === '') {
            $rupees = '0';
        }

        $paise = str_pad(
            $paise,
            2,
            '0'
        );

        if ($rupees === '0' && $paise === '00') {
            return null;
        }

        return $rupees.'.'.$paise;
    }

    /**
     * Identify debit or credit from spoken text.
     */
    private function extractType(string $text): ?string
    {
        $normalized = Str::lower($text);

        $creditWords = [
            'જમા',
            'ચૂકવ્યા',
            'ચૂકવ્યું',
            'ભર્યા',
            'પૈસા આપ્યા',
            'paid',
            'payment',
            'received',
            'credit',
        ];

        $debitWords = [
            'ઉધાર',
            'બાકી',
            'debit',
            'gave',
            'loan',
        ];

        $hasCredit = false;
        $hasDebit = false;

        foreach ($creditWords as $word) {
            if (Str::contains($normalized, $word)) {
                $hasCredit = true;
                break;
            }
        }

        foreach ($debitWords as $word) {
            if (Str::contains($normalized, $word)) {
                $hasDebit = true;
                break;
            }
        }

        /*
         * Ambiguous phrases must not be auto-classified.
         */
        if ($hasCredit && $hasDebit) {
            return null;
        }

        if ($hasCredit) {
            return 'credit';
        }

        if ($hasDebit) {
            return 'debit';
        }

        return null;
    }

    /**
     * Match customer names and aliases against text.
     *
     * Returns at most 10 candidate customers.
     */
    private function matchCustomers(string $text): array
    {
        $normalizedText = Str::lower(
            trim($text)
        );

        $customers = Customer::query()
            ->where('is_active', true)
            ->select([
                'id',
                'name_en',
                'name_gu',
                'phone',
            ])
            ->get();

        $aliases = DB::table('customer_aliases')
            ->select([
                'customer_id',
                'alias',
            ])
            ->get()
            ->groupBy('customer_id');

        $matches = [];

        foreach ($customers as $customer) {
            $names = array_filter([
                $customer->name_en,
                $customer->name_gu,
            ]);

            foreach (
                $aliases->get($customer->id, collect())
                as $alias
            ) {
                if (! empty($alias->alias)) {
                    $names[] = $alias->alias;
                }
            }

            $score = 0;

            foreach ($names as $name) {
                $normalizedName = Str::lower(
                    trim($name)
                );

                if ($normalizedName === '') {
                    continue;
                }

                if (Str::contains(
                    $normalizedText,
                    $normalizedName
                )) {
                    $score = max(
                        $score,
                        mb_strlen($normalizedName)
                    );
                }
            }

            if ($score > 0) {
                $matches[] = [
                    'id' => $customer->id,
                    'name_en' => $customer->name_en,
                    'name_gu' => $customer->name_gu,
                    'phone' => $customer->phone,
                    'match_score' => $score,
                ];
            }
        }

        usort(
            $matches,
            fn (array $a, array $b) =>
                $b['match_score'] <=> $a['match_score']
        );

        return array_slice(
            $matches,
            0,
            10
        );
    }
}
