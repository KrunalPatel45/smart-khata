<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customer_aliases', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')
                ->constrained('customers')
                ->restrictOnDelete();
            $table->string('alias', 150);
            $table->string('normalized_alias', 150);
            $table->enum('language', ['gu', 'en'])->default('gu');
            $table->timestamps();

            $table->unique('normalized_alias');
            $table->index('customer_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_aliases');
    }
};