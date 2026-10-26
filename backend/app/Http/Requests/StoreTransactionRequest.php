<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreTransactionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('amount'))) {
            $this->merge([
                'amount' => trim($this->input('amount')),
            ]);
        }
    }

    public function rules(): array
    {
        return [
            'customer_id' => [
                'required',
                'integer',
                Rule::exists('customers', 'id')
                    ->where('is_active', true)
                    ->whereNull('deleted_at'),
            ],
            'type' => ['required', Rule::in(['debit', 'credit'])],
            'amount' => [
                'required',
                'string',
                'regex:/^\d{1,13}\.\d{2}$/D',
                'not_in:0.00',
            ],
            'description_en' => [
                'nullable', 'string', 'max:255'
            ],
            'description_gu' => [
                'nullable', 'string', 'max:255'
            ],
            'idempotency_key' => [
                'required', 'uuid'
            ],
        ];
    }

    public function messages(): array
    {
        return [
            'amount.regex' =>
                'Amount must be like 10.00 or 125.50.',
            'idempotency_key.uuid' =>
                'A valid request UUID is required.',
        ];
    }
}