<?php
function routeCoupons(string $method, string $seg1): void {
    // GET /coupons/validate?code=XXX
    if ($method === 'GET' && $seg1 === 'validate') {
        $code = strtoupper(trim($_GET['code'] ?? ''));
        if (!$code) jsonOut(['data' => null, 'valid' => false]);
        $c = queryOne("SELECT id, code, type, value, max_discount_amount, min_order_value, is_active FROM coupons WHERE code = ? AND is_active = 1 LIMIT 1", 's', [$code]);
        if (!$c) jsonOut(['data' => null, 'valid' => false]);
        jsonOut(['data' => [
            'id' => $c['id'], 'code' => $c['code'], 'type' => $c['type'], 'value' => (float)$c['value'],
            'maxDiscountAmount' => $c['max_discount_amount'] !== null ? (float)$c['max_discount_amount'] : null,
            'minOrderValue'     => $c['min_order_value'] !== null ? (float)$c['min_order_value'] : null,
            'isActive' => (bool)$c['is_active'],
        ], 'valid' => true]);
    }
    jsonOut(['error' => 'Not found'], 404);
}
