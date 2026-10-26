<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Transaction extends Model
{
    protected $fillable = [
        'uuid',
        'customer_id',
        'type',
        'amount',
        'description_en',
        'description_gu',
        'source',
        'idempotency_key',
        'created_by',
        'reversal_of_id',
        'transaction_at',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'transaction_at' => 'datetime',
        ];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function reversedTransaction(): BelongsTo
    {
        return $this->belongsTo(
            self::class,
            'reversal_of_id'
        );
    }
}