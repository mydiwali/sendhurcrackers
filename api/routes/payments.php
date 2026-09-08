<?php
// Normalize payment record
function normalizePayment(array $p): array {
    return [
        'id'              => $p['id'],
        'orderId'         => $p['order_id'],
        'amount'          => (float)$p['amount'],
        'paymentMethod'   => $p['payment_method'],
        'referenceNumber' => $p['reference_number'],
        'notes'           => $p['notes'],
        'recordedBy'      => $p['recorded_by'],
        'createdAt'       => ['seconds' => toSeconds($p['created_at'])],
    ];
}

function routePayments(string $method, string $seg1, string $seg2): void {
    requireAdmin();

    // GET /admin/payments/:orderId — get all payments for an order
    if ($method === 'GET' && $seg1) {
        $payments = queryAll(
            'SELECT id, order_id, amount, payment_method, reference_number, notes, recorded_by, created_at
             FROM payments WHERE order_id = ? ORDER BY created_at DESC',
            's',
            [$seg1]
        );
        $normalized = array_map(fn($p) => normalizePayment($p), $payments);
        
        // Get order total
        $order = queryOne('SELECT total FROM orders WHERE id = ? LIMIT 1', 's', [$seg1]);
        if (!$order) {
            jsonOut(['error' => 'Order not found'], 404);
        }
        
        $orderTotal = (float)$order['total'];
        $amountCollected = array_reduce($payments, fn($sum, $p) => $sum + (float)$p['amount'], 0);
        $balanceDue = $orderTotal - $amountCollected;
        $paymentStatus = $balanceDue <= 0 ? 'Paid' : ($amountCollected > 0 ? 'Partial Payment' : 'Unpaid');
        
        jsonOut(['data' => [
            'payments'         => $normalized,
            'orderTotal'       => $orderTotal,
            'amountCollected'  => $amountCollected,
            'balanceDue'       => max(0, $balanceDue),
            'paymentStatus'    => $paymentStatus,
        ]]);
    }

    // POST /admin/payments/:orderId — record a payment
    if ($method === 'POST' && $seg1) {
        $admin = requireAdmin();
        $body = jsonBody();
        
        $amount = (float)($body['amount'] ?? 0);
        if ($amount <= 0) {
            jsonOut(['error' => 'Amount must be greater than 0'], 400);
        }
        
        // Verify order exists
        $order = queryOne('SELECT id, total FROM orders WHERE id = ? LIMIT 1', 's', [$seg1]);
        if (!$order) {
            jsonOut(['error' => 'Order not found'], 404);
        }
        
        $paymentId = uuid();
        execute(
            'INSERT INTO payments (id, order_id, amount, payment_method, reference_number, notes, recorded_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
            'ssdssss',
            [
                $paymentId,
                $seg1,
                $amount,
                $body['paymentMethod'] ?? 'Manual',
                $body['referenceNumber'] ?? null,
                $body['notes'] ?? null,
                $admin['id'],
            ]
        );
        
        $payment = queryOne(
            'SELECT id, order_id, amount, payment_method, reference_number, notes, recorded_by, created_at
             FROM payments WHERE id = ? LIMIT 1',
            's',
            [$paymentId]
        );
        
        jsonOut(['data' => normalizePayment($payment)], 201);
    }

    // DELETE /admin/payments/:paymentId — delete a payment (admin only)
    if ($method === 'DELETE' && $seg1) {
        requireAdmin();
        $payment = queryOne('SELECT id, order_id FROM payments WHERE id = ? LIMIT 1', 's', [$seg1]);
        if (!$payment) {
            jsonOut(['error' => 'Payment not found'], 404);
        }
        
        execute('DELETE FROM payments WHERE id = ?', 's', [$seg1]);
        jsonOut(['data' => ['success' => true]]);
    }

    jsonOut(['error' => 'Not found'], 404);
}
