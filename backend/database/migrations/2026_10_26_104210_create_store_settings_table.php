<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('store_settings', function (Blueprint $table) {
            $table->id();
            $table->string('store_name_en', 150);
            $table->string('store_name_gu', 150)->nullable();
            $table->string('owner_name', 150)->nullable();
            $table->string('phone', 20)->nullable();
            $table->text('address')->nullable();
            $table->enum('default_language', ['gu', 'en'])->default('gu');
            $table->string('currency', 3)->default('INR');
            $table->string('timezone', 60)->default('Asia/Kolkata');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('store_settings');
    }
};