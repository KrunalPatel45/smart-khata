<?php

use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\CustomerController;
use App\Http\Controllers\Api\V1\ReportController;
use App\Http\Controllers\Api\V1\TransactionController;
use App\Http\Controllers\Api\V1\VoiceEntryController;
use App\Http\Controllers\Api\V1\VoiceEntrySaveController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {

    Route::post('/login', [AuthController::class, 'login'])
        ->middleware('throttle:5,1');

    Route::middleware('auth:sanctum')->group(function () {

        Route::get('/me', [AuthController::class, 'me']);
        Route::post('/logout', [AuthController::class, 'logout']);

        Route::apiResource('customers', CustomerController::class);

        Route::get('/customers/{customer}/ledger', [
            TransactionController::class, 'ledger',
        ]);

        Route::get('/transactions', [
            TransactionController::class, 'index',
        ]);

        Route::post('/transactions', [
            TransactionController::class, 'store',
        ])->middleware('throttle:60,1');

        Route::post('/transactions/{transaction}/reverse', [
            TransactionController::class, 'reverse',
        ])->middleware('throttle:30,1');

        Route::get('/reports/summary', [
            ReportController::class, 'summary',
        ]);

        // Existing voice parser
        Route::post('/voice/parse', [
            VoiceEntryController::class, 'parse',
        ])->name('voice.parse');

        // New: find customer by spoken name
        Route::post('/voice/customer-match', [
            VoiceEntrySaveController::class, 'match',
        ])->middleware('throttle:60,1');

        // New: save customer and transaction together
        Route::post('/voice/save', [
            VoiceEntrySaveController::class, 'store',
        ])->middleware('throttle:30,1');
    });
});