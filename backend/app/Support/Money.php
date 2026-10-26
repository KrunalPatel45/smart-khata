<?php

namespace App\Support;

use InvalidArgumentException;

final class Money
{
    public static function toPaise(string $amount): int
    {
        if (! preg_match('/^-?\d{1,13}\.\d{2}$/D', $amount)) {
            throw new InvalidArgumentException(
                'Invalid money amount: '.$amount
            );
        }

        $negative = str_starts_with($amount, '-');
        $absolute = ltrim($amount, '-');
        [$rupees, $paise] = explode('.', $absolute);

        $value = ((int) $rupees * 100) + (int) $paise;

        return $negative ? -$value : $value;
    }

    public static function fromPaise(int $paise): string
    {
        $negative = $paise < 0 ? '-' : '';
        $absolute = abs($paise);

        return $negative
            .intdiv($absolute, 100)
            .'.'
            .str_pad(
                (string) ($absolute % 100),
                2,
                '0',
                STR_PAD_LEFT
            );
    }
}