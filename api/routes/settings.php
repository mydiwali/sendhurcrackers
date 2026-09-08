<?php
function getSetting(string $key): mixed {
    $row = queryOne("SELECT value FROM settings WHERE `key` = ? LIMIT 1", 's', [$key]);
    return $row ? (parseJ($row['value']) ?? null) : null;
}

function upsertSetting(string $key, mixed $value): void {
    $json = json_encode($value);
    execute("INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", 'ss', [$key, $json]);
}

function routeSettings(string $method, string $seg1, string $seg2): void {
    // GET /settings/store
    if ($method === 'GET' && $seg1 === 'store') {
        $value = getSetting('store');
        jsonOut(['data' => $value ?? ['name' => 'ShopStore', 'description' => '']]);
    }

    // GET /settings/page-config
    if ($method === 'GET' && $seg1 === 'page-config') {
        $value = getSetting('pageConfig');
        jsonOut(['data' => $value ?? ['sections' => []]]);
    }

    // GET /settings/banners
    if ($method === 'GET' && $seg1 === 'banners') {
        $value = getSetting('banners');
        $banners = [];
        if ($value && isset($value['banners'])) {
            $banners = array_filter($value['banners'], fn($b) => $b['active'] ?? false);
            usort($banners, fn($a, $b) => ($a['order'] ?? 0) <=> ($b['order'] ?? 0));
            $banners = array_values($banners);
        }
        jsonOut(['data' => $banners]);
    }

    jsonOut(['error' => 'Not found'], 404);
}
