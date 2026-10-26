<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('transactions', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('customer_id')
                ->constrained('customers')
                ->restrictOnDelete();
            $table->enum('type', ['debit', 'credit']);
            $table->decimal('amount', 15, 2);
            $table->string('description_en', 255)->nullable();
            $table->string('description_gu', 255)->nullable();
            $table->enum('source', ['manual', 'voice', 'system'])
                ->default('manual');
            $table->string('idempotency_key', 100)->unique();
            $table->foreignId('created_by')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();
            $table->foreignId('reversal_of_id')
                ->nullable()
                ->unique()
                ->constrained('transactions')
                ->restrictOnDelete();
            $table->timestamp('transaction_at');
            $table->timestamps();

            $table->index(['customer_id', 'transaction_at']);
            $table->index(['type', 'transaction_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('transactions');
    }
};