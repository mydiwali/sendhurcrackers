<?php
function normalizeOrder(array $o, bool $withItems = false): array {
    $out = [
        'id'              => $o['id'],
        'orderNumber'     => $o['order_number'],
        'userId'          => $o['user_id'],
        'email'           => $o['email'],
        'phone'           => $o['phone'],
        'guestEmail'      => $o['guest_email'],
        'guestPhone'      => $o['guest_phone'],
        'guestName'       => $o['guest_name'],
        'status'          => $o['status'],
        'paymentMethod'   => $o['payment_method'],
        'total'           => $o['total'] !== null ? (float)$o['total'] : null,
        'totalAmount'     => $o['total_amount'] !== null ? (float)$o['total_amount'] : null,
        'couponCode'      => $o['coupon_code'] ?? null,
        'discountAmount'  => isset($o['discount_amount']) ? (float)$o['discount_amount'] : 0,
        'subtotalAmount'  => isset($o['subtotal_amount']) && $o['subtotal_amount'] !== null ? (float)$o['subtotal_amount'] : null,
        'shippingAddress' => parseJ($o['shipping_address']),
        'hasLrCopy'       => (bool)($o['has_lr_copy'] ?? false),
        'createdAt'       => ['seconds' => toSeconds($o['created_at'])],
        'updatedAt'       => ['seconds' => toSeconds($o['updated_at'] ?? null)],
    ];
    if ($withItems || isset($o['items'])) {
        $out['items'] = parseJ($o['items']);
    }
    return $out;
}

function routeOrders(string $method, string $seg1, string $seg2): void {

    // POST /orders — place order
    if ($method === 'POST' && !$seg1) {
        $authUser = getAuthUser();
        $b        = jsonBody();
        $items    = $b['items'] ?? [];
        $subtotal = array_sum(array_map(fn($i) => ($i['price']??0)*($i['quantity']??1), $items));

        // Re-validate coupon server-side (never trust client-computed discount).
        $couponCode = null;
        $discountAmount = 0;
        if (!empty($b['couponCode'])) {
            $code = strtoupper(trim($b['couponCode']));
            $c = queryOne("SELECT id, code, type, value, max_discount_amount, min_order_value, is_active FROM coupons WHERE code = ? AND is_active = 1 LIMIT 1", 's', [$code]);
            if ($c) {
                $minOrderValue = $c['min_order_value'] !== null ? (float)$c['min_order_value'] : 0;
                if ($minOrderValue <= 0 || $subtotal >= $minOrderValue) {
                    if (strtoupper((string)$c['type']) === 'PERCENTAGE') {
                        $discountAmount = ($subtotal * (float)$c['value']) / 100;
                        if ($c['max_discount_amount'] !== null) {
                            $discountAmount = min($discountAmount, (float)$c['max_discount_amount']);
                        }
                    } else {
                        $discountAmount = (float)$c['value'];
                    }
                    $discountAmount = max(0, min($discountAmount, $subtotal));
                    $couponCode = $c['code'];
                }
            }
        }
        $total = $subtotal - $discountAmount;

        // Enforce min order amount (checked against subtotal, before discount)
        $settings = queryOne("SELECT value FROM settings WHERE `key` = 'store' LIMIT 1");
        if ($settings) {
            $storeData = parseJ($settings['value']) ?? [];
            $minOrder  = (float)($storeData['minOrderAmount'] ?? 0);
            if ($minOrder > 0 && $subtotal < $minOrder) {
                jsonOut(['error' => "Minimum order amount is ₹$minOrder. Your cart total is ₹$subtotal."], 400);
            }
        }

        // Atomic counter
        execute("UPDATE counters SET last_id = last_id + 1 WHERE `key` = 'orders'");
        $counter = queryOne("SELECT last_id FROM counters WHERE `key` = 'orders'");
        $nextId  = (int)($counter['last_id'] ?? 101);
        $orderNumber = 'ORD-' . $nextId;

        $id = uuid();
        $sa = $b['shippingAddress'] ?? [];
        execute(
            'INSERT INTO orders (id, order_number, user_id, email, phone, guest_email, guest_phone, guest_name,
             status, payment_method, total, total_amount, shipping_address, items, coupon_code, discount_amount, subtotal_amount, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, "pending", ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
            'sssssssssddsssdd',
            [
                $id, $orderNumber,
                $authUser['id'] ?? null,
                $authUser['email'] ?? $b['guestEmail'] ?? '',
                $sa['phone'] ?? $b['guestPhone'] ?? '',
                $b['guestEmail'] ?? null,
                $b['guestPhone'] ?? null,
                $b['guestName']  ?? null,
                $b['paymentMethod'] ?? 'COD',
                $total, $total,
                json_encode($sa),
                json_encode($items),
                $couponCode,
                $discountAmount,
                $subtotal,
            ]
        );
        jsonOut(['data' => ['id' => $id, 'orderNumber' => $orderNumber, 'total' => $total, 'discountAmount' => $discountAmount, 'subtotalAmount' => $subtotal, 'couponCode' => $couponCode]]);
    }

    // GET /orders/track
    if ($method === 'GET' && $seg1 === 'track') {
        $orderNumber = $_GET['orderNumber'] ?? '';
        $phone       = $_GET['phone'] ?? '';
        if ($orderNumber) {
            $o = queryOne('SELECT id, order_number, status, total, phone, shipping_address, created_at FROM orders WHERE order_number = ? LIMIT 1', 's', [$orderNumber]);
            if ($o) {
                $sa = parseJ($o['shipping_address']);
                if (!$phone || $o['phone'] === $phone || ($sa['phone'] ?? '') === $phone) {
                    jsonOut(['data' => ['id'=>$o['id'],'orderNumber'=>$o['order_number'],'status'=>$o['status'],'total'=>(float)$o['total'],'shippingAddress'=>$sa,'createdAt'=>['seconds'=>toSeconds($o['created_at'])]]]);
                }
            }
        }
        if ($phone) {
            $o = queryOne('SELECT id, order_number, status, total, shipping_address, created_at FROM orders WHERE phone = ? ORDER BY created_at DESC LIMIT 1', 's', [$phone]);
            if ($o) jsonOut(['data' => ['id'=>$o['id'],'orderNumber'=>$o['order_number'],'status'=>$o['status'],'total'=>(float)$o['total'],'shippingAddress'=>parseJ($o['shipping_address']),'createdAt'=>['seconds'=>toSeconds($o['created_at'])]]]);
        }
        jsonOut(['data' => null]);
    }

    // GET /orders (authenticated user's orders)
    if ($method === 'GET' && !$seg1) {
        $authUser = requireAuth();
        $rows = queryAll('SELECT id, order_number, status, total, discount_amount, subtotal_amount, coupon_code, created_at, items, shipping_address FROM orders WHERE user_id = ? ORDER BY created_at DESC', 's', [$authUser['id']]);
        $orders = array_map(fn($o) => [
            'id' => $o['id'], 'orderNumber' => $o['order_number'], 'status' => $o['status'],
            'total' => (float)$o['total'],
            'discountAmount' => isset($o['discount_amount']) ? (float)$o['discount_amount'] : 0,
            'subtotalAmount' => isset($o['subtotal_amount']) && $o['subtotal_amount'] !== null ? (float)$o['subtotal_amount'] : null,
            'couponCode' => $o['coupon_code'] ?? null,
            'createdAt' => ['seconds' => toSeconds($o['created_at'])],
            'items' => parseJ($o['items']),
            'shippingAddress' => parseJ($o['shipping_address']),
        ], $rows);
        jsonOut(['data' => ['content' => $orders]]);
    }

    // GET /orders/:orderNumber/tracking
    if ($method === 'GET' && $seg1 && $seg2 === 'tracking') {
        $order = queryOne('SELECT id, order_number, status, total, shipping_address FROM orders WHERE order_number = ? LIMIT 1', 's', [$seg1]);
        if (!$order) jsonOut(['data' => null]);
        $tracking = queryAll('SELECT id, status, message, created_at FROM order_tracking WHERE order_id = ? ORDER BY created_at DESC', 's', [$order['id']]);
        jsonOut(['data' => [
            'id' => $order['id'], 'orderNumber' => $order['order_number'],
            'status' => $order['status'], 'total' => (float)$order['total'],
            'shippingAddress' => parseJ($order['shipping_address']),
            'tracking' => array_map(fn($t) => ['id'=>$t['id'],'status'=>$t['status'],'message'=>$t['message'],'createdAt'=>$t['created_at']], $tracking),
        ]]);
    }

    // GET /orders/:orderNumber/lr-copy
    if ($method === 'GET' && $seg1 && $seg2 === 'lr-copy') {
        $row = queryOne("SELECT url FROM order_attachments WHERE order_id = (SELECT id FROM orders WHERE order_number=? LIMIT 1) AND type='lr-copy' LIMIT 1", 's', [$seg1]);
        jsonOut(['data' => $row['url'] ?? null]);
    }

    // GET /orders/:orderNumber
    if ($method === 'GET' && $seg1) {
        $o = queryOne('SELECT id, order_number, status, total, discount_amount, subtotal_amount, coupon_code, created_at, items, shipping_address FROM orders WHERE order_number = ? LIMIT 1', 's', [$seg1]);
        if (!$o) jsonOut(['data' => null]);
        jsonOut(['data' => [
            'id'=>$o['id'],'orderNumber'=>$o['order_number'],'status'=>$o['status'],'total'=>(float)$o['total'],
            'discountAmount'=>isset($o['discount_amount']) ? (float)$o['discount_amount'] : 0,
            'subtotalAmount'=>isset($o['subtotal_amount']) && $o['subtotal_amount'] !== null ? (float)$o['subtotal_amount'] : null,
            'couponCode'=>$o['coupon_code'] ?? null,
            'items'=>parseJ($o['items']),'shippingAddress'=>parseJ($o['shipping_address']),'createdAt'=>['seconds'=>toSeconds($o['created_at'])]]]);
    }

    jsonOut(['error' => 'Not found'], 404);
}
