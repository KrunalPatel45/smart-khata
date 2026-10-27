<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Transaction;
use App\Support\Money;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class VoiceEntrySaveController extends Controller
{
    private function normalize(string $name): string
    {
        return mb_strtolower(
            preg_replace('/\s+/u', ' ', trim($name)),
            'UTF-8'
        );
    }

    private function exactMatches(string $name)
    {
        $normalized = $this->normalize($name);

        return Customer::query()
            ->where('is_active', true)
            ->where(function ($query) use ($normalized) {
                $query->whereRaw('LOWER(TRIM(name_en)) = ?', [$normalized])
                    ->orWhereRaw('LOWER(TRIM(name_gu)) = ?', [$normalized])
                    ->orWhereHas('aliases', function ($q) use ($normalized) {
                        $q->where('normalized_alias', $normalized);
                    });
            })
            ->get();
    }

    public function match(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:150'],
        ]);

        $name = trim($data['name']);
        $exact = $this->exactMatches($name);

        if ($exact->count() === 1) {
            return response()->json([
                'success' => true,
                'status' => 'existing',
                'customer' => $exact->first(),
                'matches' => [],
            ]);
        }

        if ($exact->count() > 1) {
            return response()->json([
                'success' => true,
                'status' => 'similar',
                'customer' => null,
                'matches' => $exact->take(10)->values(),
            ]);
        }

        $similar = Customer::query()
            ->where('is_active', true)
            ->where(function ($q) use ($name) {
                $q->where('name_en', 'like', '%'.$name.'%')
                    ->orWhere('name_gu', 'like', '%'.$name.'%')
                    ->orWhereHas('aliases', function ($a) use ($name) {
                        $a->where('alias', 'like', '%'.$name.'%');
                    });
            })
            ->limit(10)
            ->get();

        return response()->json([
            'success' => true,
            'status' => $similar->isEmpty() ? 'new' : 'similar',
            'customer' => null,
            'matches' => $similar,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'customer_name' => [
                'required_without:customer_id', 'nullable',
                'string', 'min:2', 'max:150',
            ],
            'language' => ['required', 'in:gu-IN,en-IN'],
            'type' => ['required', 'in:debit,credit'],
            'amount' => [
                'required', 'regex:/^\d{1,13}(?:\.\d{1,2})?$/',
            ],
            'idempotency_key' => ['required', 'uuid'],
        ]);

        $amount = Money::toPaise($data['amount']);

        if ($amount <= 0) {
            throw ValidationException::withMessages([
                'amount' => ['Amount must be greater than zero.'],
            ]);
        }

        try {
            $result = DB::transaction(function () use ($data, $amount, $request) {
                $existing = Transaction::query()
                    ->where('idempotency_key', $data['idempotency_key'])
                    ->first();

                if ($existing) {
                    if (
                        $existing->type !== $data['type']
                        || Money::toPaise($existing->amount) !== $amount
                        || (
                            !empty($data['customer_id'])
                            && $existing->customer_id !== (int) $data['customer_id']
                        )
                    ) {
                        return ['conflict' => true];
                    }

                    return [
                        'customer' => Customer::find($existing->customer_id),
                        'transaction' => $existing,
                        'replayed' => true,
                    ];
                }

                if (!empty($data['customer_id'])) {
                    $customer = Customer::query()
                        ->whereKey($data['customer_id'])
                        ->where('is_active', true)
                        ->lockForUpdate()
                        ->firstOrFail();
                } else {
                    $name = trim($data['customer_name']);
                    $matches = $this->exactMatches($name);

                    if ($matches->count() > 1) {
                        throw ValidationException::withMessages([
                            'customer_name' => [
                                'Multiple matching customers. Please select one.',
                            ],
                        ]);
                    }

                    if ($matches->count() === 1) {
                        $customer = Customer::query()
                            ->whereKey($matches->first()->id)
                            ->lockForUpdate()
                            ->firstOrFail();
                    } else {
                        $customer = Customer::create([
                            'name_gu' => $data['language'] === 'gu-IN'
                                ? $name : null,
                            'name_en' => $data['language'] === 'en-IN'
                                ? $name : null,
                            'is_active' => true,
                        ]);

                        $customer->aliases()->create([
                            'alias' => $name,
                            'normalized_alias' => $this->normalize($name),
                            'language' => $data['language'] === 'gu-IN'
                                ? 'gu' : 'en',
                        ]);
                    }
                }

                // Preserve the existing rule:
                // Received money cannot exceed outstanding balance.
                if ($data['type'] === 'credit') {
                    $row = DB::table('transactions')
                        ->where('customer_id', $customer->id)
                        ->selectRaw(
                            "COALESCE(SUM(CASE WHEN type = 'debit' 
                             THEN amount ELSE -amount END), 0) AS balance"
                        )
                        ->first();

                    $balance = Money::toPaise((string) $row->balance);

                    if ($amount > $balance) {
                        throw ValidationException::withMessages([
                            'amount' => [
                                'Payment exceeds outstanding balance.',
                            ],
                        ]);
                    }
                }

                $transaction = Transaction::create([
                    'uuid' => (string) Str::uuid(),
                    'customer_id' => $customer->id,
                    'type' => $data['type'],
                    'amount' => Money::fromPaise($amount),
                    'description_gu' => null,
                    'description_en' => null,
                    'source' => 'manual',
                    'idempotency_key' => $data['idempotency_key'],
                    'created_by' => $request->user()->id,
                    'transaction_at' => now(),
                ]);

                return [
                    'customer' => $customer,
                    'transaction' => $transaction,
                    'replayed' => false,
                ];
            }, 3);
        } catch (UniqueConstraintViolationException $e) {
            throw ValidationException::withMessages([
                'customer_name' => [
                    'Customer name or transaction already exists. Retry safely.',
                ],
            ]);
        }

        if (!empty($result['conflict'])) {
            return response()->json([
                'success' => false,
                'message' => 'Idempotency key conflict.',
            ], 409);
        }

        return response()->json([
            'success' => true,
            'message' => 'Voice entry saved successfully.',
            'replayed' => $result['replayed'],
            'data' => $result,
        ], $result['replayed'] ? 200 : 201);
    }
}