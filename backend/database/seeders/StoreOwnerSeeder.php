<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use RuntimeException;

class StoreOwnerSeeder extends Seeder
{
    public function run(): void
    {
        $name = env('STORE_OWNER_NAME', 'Store Owner');
        $email = env('STORE_OWNER_EMAIL');
        $password = env('STORE_OWNER_PASSWORD');

        if (! $email || ! $password || strlen($password) < 12) {
            throw new RuntimeException(
                'Set STORE_OWNER_EMAIL and a password of at least 12 characters in .env.'
            );
        }

        User::updateOrCreate(
            ['email' => $email],
            [
                'name' => $name,
                'password' => Hash::make($password),
                'email_verified_at' => now(),
            ]
        );
    }
}