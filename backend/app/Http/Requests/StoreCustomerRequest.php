<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class StoreCustomerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    protected function prepareForValidation(): void
    {
        $fields = ['name_en', 'name_gu', 'phone', 'address', 'notes'];
        $data = [];

        foreach ($fields as $field) {
            if ($this->exists($field) && is_string($this->input($field))) {
                $value = trim($this->input($field));
                $data[$field] = $value === '' ? null : $value;
            }
        }

        $this->merge($data);
    }

    public function rules(): array
    {
        return [
            'name_en' => ['nullable', 'string', 'max:150'],
            'name_gu' => ['nullable', 'string', 'max:150'],
            'phone' => ['nullable', 'string', 'max:20'],
            'address' => ['nullable', 'string', 'max:2000'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }

    public function after(): array
    {
        return [
            function (Validator $validator): void {
                $customer = $this->route('customer');

                $en = $this->input(
                    'name_en',
                    $customer?->name_en
                );

                $gu = $this->input(
                    'name_gu',
                    $customer?->name_gu
                );

                if (! $en && ! $gu) {
                    $validator->errors()->add(
                        'name_en',
                        'Gujarati or English customer name is required.'
                    );
                }
            },
        ];
    }
}