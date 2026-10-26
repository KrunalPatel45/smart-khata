<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreCustomerRequest;
use App\Http\Requests\UpdateCustomerRequest;
use App\Models\Customer;
use App\Models\CustomerAlias;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CustomerController extends Controller
{
    private function normalize(string $value): string
    {
        $value = trim($value);
        $value = preg_replace('/\s+/u', ' ', $value);

        return mb_strtolower($value, 'UTF-8');
    }

    private function aliases(array $data): array
    {
        $result = [];

        foreach (['en', 'gu'] as $language) {
            $name = trim((string) ($data['name_'.$language] ?? ''));

            if ($name === '') {
                continue;
            }

            $normalized = $this->normalize($name);

            if (! isset($result[$normalized])) {
                $result[$normalized] = [
                    'alias' => $name,
                    'normalized_alias' => $normalized,
                    'language' => $language,
                ];
            }
        }

        return array_values($result);
    }

    private function checkAliases(
        array $aliases,
        ?int $ignoreCustomer = null
    ): void {
        $keys = array_column($aliases, 'normalized_alias');

        if ($keys === []) {
            return;
        }

        $existing = CustomerAlias::query()
            ->whereIn('normalized_alias', $keys)
            ->when($ignoreCustomer !== null, fn ($q) =>
                $q->where('customer_id', '!=', $ignoreCustomer))
            ->first();

        if ($existing) {
            throw ValidationException::withMessages([
                'name_en' => [
                    'Customer name already exists. Please select the existing customer.'
                ],
            ]);
        }
    }

    private function saveAliases(Customer $customer): void
    {
        $aliases = $this->aliases([
            'name_en' => $customer->name_en,
            'name_gu' => $customer->name_gu,
        ]);

        $this->checkAliases($aliases, $customer->id);

        $customer->aliases()->delete();

        foreach ($aliases as $alias) {
            $customer->aliases()->create($alias);
        }
    }

    private function balance(Customer $customer): array
    {
        $totals = $customer->transactions()
            ->selectRaw(
                "COALESCE(SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END), 0) AS debit"
            )
            ->selectRaw(
                "COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END), 0) AS credit"
            )
            ->selectRaw(
                "COALESCE(SUM(CASE WHEN type = 'debit' THEN amount ELSE -amount END), 0) AS balance"
            )
            ->first();

        return [
            'total_debit' => (string) $totals->debit,
            'total_credit' => (string) $totals->credit,
            'balance' => (string) $totals->balance,
        ];
    }

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'search' => ['nullable', 'string', 'max:150'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $search = trim($validated['search'] ?? '');
        $perPage = (int) ($validated['per_page'] ?? 15);

        $query = Customer::query();

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('name_en', 'like', '%'.$search.'%')
                    ->orWhere('name_gu', 'like', '%'.$search.'%')
                    ->orWhere('phone', 'like', '%'.$search.'%')
                    ->orWhereHas('aliases', fn ($a) =>
                        $a->where('alias', 'like', '%'.$search.'%'));
            });
        }

        return response()->json([
            'success' => true,
            'data' => $query->orderByDesc('id')->paginate($perPage),
        ]);
    }

    public function store(StoreCustomerRequest $request): JsonResponse
    {
        try {
            $customer = DB::transaction(function () use ($request) {
                $customer = Customer::create($request->validated());
                $this->saveAliases($customer);

                return $customer;
            });
        } catch (UniqueConstraintViolationException $e) {
            throw ValidationException::withMessages([
                'name_en' => ['Customer name already exists.'],
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Customer created.',
            'data' => $customer->load('aliases'),
        ], 201);
    }

    public function show(Customer $customer): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => [
                'customer' => $customer->load('aliases'),
                ...$this->balance($customer),
            ],
        ]);
    }

    public function update(
        UpdateCustomerRequest $request,
        Customer $customer
    ): JsonResponse {
        try {
            DB::transaction(function () use ($request, $customer) {
                $customer->update($request->validated());
                $this->saveAliases($customer);
            });
        } catch (UniqueConstraintViolationException $e) {
            throw ValidationException::withMessages([
                'name_en' => ['Customer name already exists.'],
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Customer updated.',
            'data' => $customer->fresh()->load('aliases'),
        ]);
    }

    public function destroy(Customer $customer): JsonResponse
    {
        if ($customer->transactions()->exists()) {
            return response()->json([
                'success' => false,
                'message' => 'Customer has transactions. Disable instead.',
            ], 409);
        }

        $customer->update(['is_active' => false]);

        return response()->json([
            'success' => true,
            'message' => 'Customer disabled.',
        ]);
    }
}