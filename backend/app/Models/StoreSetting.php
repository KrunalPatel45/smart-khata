<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class StoreSetting extends Model
{
    protected $fillable = [
        'store_name_en',
        'store_name_gu',
        'owner_name',
        'phone',
        'address',
        'default_language',
        'currency',
        'timezone',
    ];
}