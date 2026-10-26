<?php

namespace App\Http\Requests;

class UpdateCustomerRequest extends StoreCustomerRequest
{
    public function rules(): array
    {
        return array_merge(parent::rules(), [
            'is_active' => ['sometimes', 'boolean'],
        ]);
    }
}