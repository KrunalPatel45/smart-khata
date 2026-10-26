<?php

use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\CustomerController;
use App\Http\Controllers\Api\V1\ReportController;
use App\Http\Controllers\Api\V1\TransactionController;
use App\Http\Controllers\Api\V1\VoiceEntryController;

use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {

    Route::post('/login', [AuthController::class, 'login'])
        ->middleware('throttle:5,1');

    Route::middleware('auth:sanctum')->group(function () {
        Route::get('/me', [AuthController::class, 'me']);
        Route::post('/logout', [AuthController::class, 'logout']);

        Route::apiResource('customers', CustomerController::class);

        Route::get(
            '/customers/{customer}/ledger',
            [TransactionController::class, 'ledger']
        );

        Route::get(
            '/transactions',
            [TransactionController::class, 'index']
        );

        Route::post(
            '/transactions',
            [TransactionController::class, 'store']
        )->middleware('throttle:60,1');

        Route::post(
            '/transactions/{transaction}/reverse',
            [TransactionController::class, 'reverse']
        )->middleware('throttle:30,1');

        Route::get(
            '/reports/summary',
            [ReportController::class, 'summary']
        );

        Route::post('/voice/parse', [
            VoiceEntryController::class,
            'parse',
        ])->name('voice.parse');
    });
});