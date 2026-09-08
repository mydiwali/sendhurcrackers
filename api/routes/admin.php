<?php
// Shared normalizers used across admin routes
function adminNormalizeProd(array $p): array {
    return [
        'id'               => $p['id'],
        'name'             => $p['name'],
        'nameInTamil'      => $p['name_in_tamil'] ?? null,
        'slug'             => $p['slug'],
        'description'      => $p['description'] ?? null,
        'price'            => $p['price'] !== null ? (float)$p['price'] : null,
        'originalPrice'    => $p['original_price'] !== null ? (float)$p['original_price'] : null,
        'comparePrice'     => $p['original_price'] !== null ? (float)$p['original_price'] : null,
        'purchasedPrice'   => isset($p['purchased_price']) && $p['purchased_price'] !== null ? (float)$p['purchased_price'] : null,
        'sku'              => $p['sku'] ?? null,
        'stock'            => (int)($p['stock'] ?? 0),
        'lowStockThreshold'=> (int)($p['low_stock_threshold'] ?? 5),
        'categoryId'       => $p['category_id'] ?? null,
        'active'           => (bool)$p['active'],
        'status'           => $p['active'] ? 'ACTIVE' : 'DRAFT',
        'isFeatured'       => (bool)$p['is_featured'],
        'avgRating'        => $p['avg_rating'] !== null ? (float)$p['avg_rating'] : null,
        'primaryImageUrl'  => $p['primary_image_url'] ?? '',
        'productNumber'    => $p['product_number'] ?? null,
        'createdAt'        => ['seconds' => toSeconds($p['created_at'])],
        'updatedAt'        => ['seconds' => toSeconds($p['updated_at'] ?? null)],
    ];
}

function adminNormalizeCat(array $c): array {
    return [
        'id' => $c['id'], 'name' => $c['name'], 'slug' => $c['slug'],
        'description' => $c['description'], 'imageUrl' => $c['image_url'],
        'parentId' => $c['parent_id'], 'sortOrder' => (int)$c['sort_order'],
        'isActive' => (bool)$c['is_active'],
        'createdAt' => ['seconds' => toSeconds($c['created_at'])],
    ];
}

function adminNormalizeOrder(array $o, bool $withPayments = false): array {
    $base = [
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
        'items'           => isset($o['items']) ? parseJ($o['items']) : null,
        'hasLrCopy'       => (bool)($o['has_lr_copy'] ?? false),
        'createdAt'       => ['seconds' => toSeconds($o['created_at'])],
        'updatedAt'       => ['seconds' => toSeconds($o['updated_at'] ?? null)],
    ];
    
    if ($withPayments) {
        $payments = queryAll(
            'SELECT amount FROM payments WHERE order_id = ? ORDER BY created_at DESC',
            's',
            [$o['id']]
        );
        $orderTotal = (float)($o['total'] ?? 0);
        $amountCollected = array_sum(array_map(fn($p) => (float)$p['amount'], $payments));
        $balanceDue = max(0, $orderTotal - $amountCollected);
        $paymentStatus = $balanceDue <= 0 ? 'Paid' : ($amountCollected > 0 ? 'Partial Payment' : 'Unpaid');
        
        $base['amountCollected'] = $amountCollected;
        $base['balanceDue'] = $balanceDue;
        $base['paymentStatus'] = $paymentStatus;
    }
    
    return $base;
}

function adminNormalizeCoupon(array $c): array {
    return [
        'id' => $c['id'], 'code' => $c['code'], 'description' => $c['description'],
        'type' => $c['type'], 'value' => (float)$c['value'],
        'maxDiscountAmount'   => $c['max_discount_amount'] !== null ? (float)$c['max_discount_amount'] : null,
        'minOrderValue'       => $c['min_order_value'] !== null ? (float)$c['min_order_value'] : null,
        'maxUses'             => $c['max_uses'] !== null ? (int)$c['max_uses'] : null,
        'maxUsesPerCustomer'  => $c['max_uses_per_customer'] !== null ? (int)$c['max_uses_per_customer'] : null,
        'validFrom'           => $c['valid_from'], 'validUntil' => $c['valid_until'],
        'isActive'            => (bool)$c['is_active'], 'usedCount' => (int)$c['used_count'],
        'createdAt'           => $c['created_at'],
    ];
}

function adminGetSetting(string $key): mixed {
    $row = queryOne("SELECT value FROM settings WHERE `key` = ? LIMIT 1", 's', [$key]);
    return $row ? (parseJ($row['value']) ?? null) : null;
}
function adminUpsertSetting(string $key, mixed $value): void {
    execute("INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", 'ss', [$key, json_encode($value)]);
}

// ─────────────────────────────────────────────────────────────────────────────
function routeAdmin(string $method, string $r1, string $r2, string $r3, string $r4 = ''): void {
    // ══ AUTH ══════════════════════════════════════════════════════════════════
    if ($r1 === 'auth') {
        if ($method === 'POST' && $r2 === 'login') {
            $b = jsonBody();
            $emailOrUser = trim($b['email'] ?? '');
            $password    = $b['password'] ?? '';
            $name = ''; $role = 'admin';

            if (!str_contains($emailOrUser, '@')) {
                // Username login
                $uname = strtolower($emailOrUser);
                $adminUser = queryOne('SELECT * FROM admin_users WHERE username = ? LIMIT 1', 's', [$uname]);
                if (!$adminUser) jsonOut(['error' => 'Username not found'], 401);
                $email = "$uname@adminpanel.local"; $name = $uname; $role = 'subadmin';
            } else {
                $email = strtolower($emailOrUser);
            }

            $user = queryOne('SELECT id, email, password_hash FROM users WHERE email = ? LIMIT 1', 's', [$email]);
            if (!$user || !password_verify($password, $user['password_hash'])) jsonOut(['error' => 'Invalid login credentials'], 401);

            if (str_contains($emailOrUser, '@')) {
                $profile = queryOne('SELECT name, role FROM profiles WHERE id = ? LIMIT 1', 's', [$user['id']]);
                if (($profile['role'] ?? '') !== 'admin') jsonOut(['error' => 'Access denied. Admin only.'], 403);
                $name = $profile['name'] ?? ''; $role = 'admin';
            }

            $token   = jwtEncode(['id' => $user['id'], 'email' => $user['email'], 'role' => $role], 86400);
            $refresh = jwtEncode(['id' => $user['id'], 'email' => $user['email'], 'role' => $role], 604800);
            jsonOut(['data' => ['user' => ['id' => $user['id'], 'name' => $name, 'email' => $user['email'], 'role' => $role], 'accessToken' => $token, 'refreshToken' => $refresh]]);
        }

        if ($method === 'POST' && $r2 === 'register') {
            $b = jsonBody();
            $name = trim($b['name'] ?? ''); $email = strtolower(trim($b['email'] ?? '')); $password = $b['password'] ?? '';
            if (!$name || !$email || !$password) jsonOut(['error' => 'name, email and password are required'], 400);
            if (queryOne('SELECT id FROM users WHERE email = ?', 's', [$email])) jsonOut(['error' => 'Email already in use'], 400);
            $hash = password_hash($password, PASSWORD_BCRYPT); $id = uuid();
            execute('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, NOW())', 'sss', [$id, $email, $hash]);
            execute('INSERT INTO profiles (id, name, email, role, status, created_at) VALUES (?, ?, ?, "admin", "active", NOW())', 'sss', [$id, $name, $email]);
            jsonOut(['data' => ['user' => ['id' => $id]]]);
        }

        if ($method === 'POST' && $r2 === 'logout') jsonOut(['data' => []]);
        jsonOut(['error' => 'Not found'], 404);
    }

    // All routes below require admin auth
    requireAdmin();

    // ══ PRODUCTS ══════════════════════════════════════════════════════════════
    if ($r1 === 'products') {
        $PROD_COLS = 'id, name, name_in_tamil, slug, description, price, original_price, purchased_price, sku, stock,
            low_stock_threshold, category_id, active, is_featured, avg_rating,
            primary_image_url, product_number, created_at, updated_at';

        // GET /admin/products
        if ($method === 'GET' && !$r2) {
            $rows = queryAll("SELECT $PROD_COLS FROM products ORDER BY ISNULL(product_number), product_number ASC, created_at DESC");
            jsonOut(['data' => array_map('adminNormalizeProd', $rows)]);
        }
        // GET /admin/products/:id/images
        if ($method === 'GET' && $r2 && $r3 === 'images') {
            $imgs = queryAll('SELECT id, url, thumbnail_url, is_primary, sort_order FROM product_images WHERE product_id = ? ORDER BY sort_order ASC', 's', [$r2]);
            jsonOut(['data' => array_map(fn($i) => ['id'=>$i['id'],'url'=>$i['url'],'thumbnailUrl'=>$i['thumbnail_url'],'isPrimary'=>(bool)$i['is_primary'],'sortOrder'=>(int)$i['sort_order']], $imgs)]);
        }
        // GET /admin/products/:id
        if ($method === 'GET' && $r2) {
            $p = queryOne("SELECT $PROD_COLS FROM products WHERE id = ? LIMIT 1", 's', [$r2]);
            if (!$p) jsonOut(['error' => 'Product not found'], 404);
            $imgs = queryAll('SELECT id, url, thumbnail_url, is_primary, sort_order FROM product_images WHERE product_id = ? ORDER BY sort_order ASC', 's', [$r2]);
            jsonOut(['data' => array_merge(adminNormalizeProd($p), ['images' => array_map(fn($i) => ['id'=>$i['id'],'url'=>$i['url'],'thumbnailUrl'=>$i['thumbnail_url'],'isPrimary'=>(bool)$i['is_primary'],'sortOrder'=>(int)$i['sort_order']], $imgs)])]);
        }
        // POST /admin/products
        if ($method === 'POST' && !$r2) {
            $p = jsonBody(); $id = uuid();
            $name = $p['name'] ?? ''; $slug = $p['slug'] ?? strtolower(preg_replace('/[^a-z0-9]+/', '-', $name));
            $active = ($p['active'] ?? true) || ($p['status'] ?? '') === 'ACTIVE' ? 1 : 0;
            execute("INSERT INTO products (id, name, name_in_tamil, slug, description, price, original_price, purchased_price, sku, stock,
                low_stock_threshold, category_id, active, is_featured, avg_rating, primary_image_url, product_number, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())",
                'sssssdddsiisiidsi',
                [$id, $name, $p['nameInTamil']??$p['name_in_tamil']??null, $slug,
                 $p['description']??null, $p['price']??null,
                 $p['comparePrice']??$p['originalPrice']??$p['original_price']??null,
                 $p['purchasedPrice']??$p['purchased_price']??null,
                 $p['sku']??null, $p['stock']??0,
                 $p['lowStockThreshold']??$p['low_stock_threshold']??5,
                 $p['categoryId']??$p['category_id']??null,
                 $active,
                 ($p['isFeatured']??$p['is_featured']??false) ? 1 : 0,
                 $p['avgRating']??$p['avg_rating']??null,
                 $p['primaryImageUrl']??$p['primary_image_url']??null,
                 $p['productNumber']??$p['product_number']??null,
                ]);
            $row = queryOne("SELECT $PROD_COLS FROM products WHERE id = ?", 's', [$id]);
            jsonOut(['data' => adminNormalizeProd($row)]);
        }
        // PUT /admin/products/:id
        if (($method === 'PUT' || $method === 'PATCH') && $r2 && !$r3) {
            $p = jsonBody(); $sets = []; $types = ''; $vals = [];
            $addField = function($col, $val, $type) use (&$sets, &$types, &$vals) {
                if ($val !== null) { $sets[] = "$col = ?"; $types .= $type; $vals[] = $val; }
            };
            if (isset($p['name']))       { $addField('name', $p['name'], 's'); $slug = strtolower(preg_replace('/[^a-z0-9]+/', '-', $p['name'])); $addField('slug', $slug, 's'); }
            if (isset($p['slug']))         $addField('slug', $p['slug'], 's');
            if (isset($p['nameInTamil'])||isset($p['name_in_tamil'])) $addField('name_in_tamil', $p['nameInTamil']??$p['name_in_tamil'], 's');
            if (isset($p['description']))  $addField('description', $p['description'], 's');
            if (isset($p['price']))        $addField('price', $p['price'], 'd');
            if (isset($p['comparePrice'])||isset($p['originalPrice'])||isset($p['original_price'])) $addField('original_price', $p['comparePrice']??$p['originalPrice']??$p['original_price'], 'd');
            if (isset($p['purchasedPrice'])||isset($p['purchased_price'])) $addField('purchased_price', $p['purchasedPrice']??$p['purchased_price'], 'd');
            if (isset($p['sku']))          $addField('sku', $p['sku'], 's');
            if (isset($p['stock']))        $addField('stock', $p['stock'], 'i');
            if (isset($p['lowStockThreshold'])||isset($p['low_stock_threshold'])) $addField('low_stock_threshold', $p['lowStockThreshold']??$p['low_stock_threshold'], 'i');
            if (isset($p['categoryId'])||isset($p['category_id'])) $addField('category_id', $p['categoryId']??$p['category_id'], 's');
            if (isset($p['isFeatured'])||isset($p['is_featured'])) $addField('is_featured', ($p['isFeatured']??$p['is_featured']) ? 1 : 0, 'i');
            if (isset($p['avgRating'])||isset($p['avg_rating'])) $addField('avg_rating', $p['avgRating']??$p['avg_rating'], 'd');
            if (isset($p['primaryImageUrl'])||isset($p['primary_image_url'])) $addField('primary_image_url', $p['primaryImageUrl']??$p['primary_image_url'], 's');
            if (isset($p['productNumber'])||isset($p['product_number'])) $addField('product_number', $p['productNumber']??$p['product_number'], 'i');
            if (isset($p['active']))   { $sets[] = 'active = ?'; $types .= 'i'; $vals[] = $p['active'] ? 1 : 0; }
            if (isset($p['status']))   { $sets[] = 'active = ?'; $types .= 'i'; $vals[] = $p['status'] === 'ACTIVE' ? 1 : 0; }
            $sets[] = 'updated_at = NOW()';
            $types .= 's'; $vals[] = $r2;
            execute('UPDATE products SET ' . implode(', ', $sets) . ' WHERE id = ?', $types, $vals);
            jsonOut(['data' => array_merge(['id' => $r2], $p)]);
        }
        // PATCH /admin/products/:id/status
        if ($method === 'PATCH' && $r2 && $r3 === 'status') {
            $b = jsonBody();
            execute('UPDATE products SET active = ?, updated_at = NOW() WHERE id = ?', 'is', [$b['status'] === 'active' ? 1 : 0, $r2]);
            jsonOut(['data' => ['id' => $r2]]);
        }
        // DELETE /admin/products/:id
        if ($method === 'DELETE' && $r2) {
            $affected = execute('DELETE FROM products WHERE id = ?', 's', [$r2]);
            if (!$affected) jsonOut(['error' => 'Product not found'], 404);
            jsonOut(['data' => []]);
        }
    }

    // ══ CATEGORIES ════════════════════════════════════════════════════════════
    if ($r1 === 'categories') {
        $CAT_COLS = 'id, name, slug, description, image_url, parent_id, sort_order, is_active, created_at';
        if ($method === 'GET' && !$r2) { jsonOut(['data' => array_map('adminNormalizeCat', queryAll("SELECT $CAT_COLS FROM categories ORDER BY sort_order ASC"))]); }
        if ($method === 'GET' && $r2)  { $c = queryOne("SELECT $CAT_COLS FROM categories WHERE id=? LIMIT 1",'s',[$r2]); jsonOut(['data' => $c ? adminNormalizeCat($c) : null]); }
        if ($method === 'POST' && !$r2) {
            $c = jsonBody(); $id = uuid();
            execute("INSERT INTO categories (id,name,slug,description,image_url,parent_id,sort_order,is_active,created_at) VALUES (?,?,?,?,?,?,?,?,NOW())",
                'ssssssis', [$id,$c['name'],$c['slug']??null,$c['description']??null,$c['imageUrl']??$c['image_url']??null,$c['parentId']??$c['parent_id']??null,(int)($c['sortOrder']??$c['sort_order']??0),(($c['isActive']??$c['is_active']??true)?1:0)]);
            jsonOut(['data' => adminNormalizeCat(queryOne("SELECT $CAT_COLS FROM categories WHERE id=?",'s',[$id]))]);
        }
        if ($method === 'PUT' && $r2) {
            $c=$jsonBody=jsonBody(); $sets=[];$types='';$vals=[];
            $add=function($col,$val,$t) use(&$sets,&$types,&$vals){if($val!==null){$sets[]="$col=?";$types.=$t;$vals[]=$val;}};
            $add('name',$c['name']??null,'s');$add('slug',$c['slug']??null,'s');$add('description',$c['description']??null,'s');
            $add('image_url',$c['imageUrl']??$c['image_url']??null,'s');$add('parent_id',$c['parentId']??$c['parent_id']??null,'s');
            $add('sort_order',$c['sortOrder']??$c['sort_order']??null,'i');
            if(isset($c['isActive'])||isset($c['is_active'])){$sets[]='is_active=?';$types.='i';$vals[]=($c['isActive']??$c['is_active'])?1:0;}
            if($sets){$types.='s';$vals[]=$r2;execute('UPDATE categories SET '.implode(',',$sets).' WHERE id=?',$types,$vals);}
            jsonOut(['data'=>array_merge(['id'=>$r2],$c)]);
        }
        if ($method === 'DELETE' && $r2) { execute('DELETE FROM categories WHERE id=?','s',[$r2]); jsonOut(['data'=>[]]); }
    }

    // ══ ORDERS ════════════════════════════════════════════════════════════════
    if ($r1 === 'orders') {
        $ORDER_LIST = 'id,order_number,user_id,email,phone,guest_email,guest_phone,guest_name,status,payment_method,total,total_amount,coupon_code,discount_amount,subtotal_amount,shipping_address,has_lr_copy,created_at,updated_at';

        $computePaymentSummary = function(string $orderId): array {
            $payments = queryAll(
                'SELECT id, order_id, amount, payment_method, reference_number, notes, recorded_by, created_at
                 FROM payments WHERE order_id = ? ORDER BY created_at DESC',
                's',
                [$orderId]
            );
            $order = queryOne('SELECT total FROM orders WHERE id = ? LIMIT 1', 's', [$orderId]);
            if (!$order) {
                jsonOut(['error' => 'Order not found'], 404);
            }
            $orderTotal = (float)($order['total'] ?? 0);
            $amountCollected = array_sum(array_map(fn($p) => (float)$p['amount'], $payments));
            $balanceDue = max(0, $orderTotal - $amountCollected);
            $paymentStatus = $balanceDue <= 0 ? 'Paid' : ($amountCollected > 0 ? 'Partial Payment' : 'Unpaid');

            $normalized = array_map(fn($p) => [
                'id'              => $p['id'],
                'orderId'         => $p['order_id'],
                'amount'          => (float)$p['amount'],
                'paymentMethod'   => $p['payment_method'],
                'referenceNumber' => $p['reference_number'],
                'notes'           => $p['notes'],
                'recordedBy'      => $p['recorded_by'],
                'createdAt'       => ['seconds' => toSeconds($p['created_at'])],
            ], $payments);

            return [
                'payments' => $normalized,
                'orderTotal' => $orderTotal,
                'amountCollected' => $amountCollected,
                'balanceDue' => $balanceDue,
                'paymentStatus' => $paymentStatus,
            ];
        };

        // GET /admin/orders/by-customer/:id
        if ($method === 'GET' && $r2 === 'by-customer' && $r3) {
            $strId = $r3;
            if (str_contains($strId, '@')) {
                $rows = queryAll("SELECT $ORDER_LIST FROM orders WHERE guest_email=? OR JSON_UNQUOTE(JSON_EXTRACT(shipping_address,'$.email'))=? ORDER BY created_at DESC", 'ss', [$strId,$strId]);
            } elseif (preg_match('/^[0-9+]/', $strId)) {
                $rows = queryAll("SELECT $ORDER_LIST FROM orders WHERE guest_phone=? OR phone=? ORDER BY created_at DESC", 'ss', [$strId,$strId]);
            } else {
                $rows = queryAll("SELECT $ORDER_LIST FROM orders WHERE user_id=? ORDER BY created_at DESC", 's', [$strId]);
            }
            jsonOut(['data' => ['content' => array_map(fn($row) => adminNormalizeOrder($row, true), $rows)]]);
        }
        // GET /admin/orders/:id/items
        if ($method === 'GET' && $r2 && $r3 === 'items') {
            $o = queryOne('SELECT items FROM orders WHERE id=? LIMIT 1','s',[$r2]);
            jsonOut(['data' => $o ? (parseJ($o['items'])??[]) : []]);
        }
        // GET /admin/orders/:id/tracking
        if ($method === 'GET' && $r2 && $r3 === 'tracking') {
            $rows = queryAll('SELECT * FROM order_tracking WHERE order_id=? ORDER BY created_at DESC','s',[$r2]);
            jsonOut(['data' => array_map(fn($t)=>array_merge($t,['createdAt'=>['seconds'=>toSeconds($t['created_at'])]]), $rows)]);
        }
        // GET /admin/orders/:id/lr-copy
        if ($method === 'GET' && $r2 && $r3 === 'lr-copy') {
            $row = queryOne("SELECT url FROM order_attachments WHERE order_id=? AND type='lr-copy' LIMIT 1",'s',[$r2]);
            jsonOut(['data' => $row['url']??null]);
        }

        // GET /admin/orders/:id/payments
        if ($method === 'GET' && $r2 && $r3 === 'payments') {
            jsonOut(['data' => $computePaymentSummary($r2)]);
        }

        // POST /admin/orders/:id/payments
        if ($method === 'POST' && $r2 && $r3 === 'payments') {
            $admin = requireAdmin();
            $b = jsonBody();
            $amount = (float)($b['amount'] ?? 0);
            if ($amount <= 0) {
                jsonOut(['error' => 'Amount must be greater than 0'], 400);
            }
            if (!queryOne('SELECT id FROM orders WHERE id = ? LIMIT 1', 's', [$r2])) {
                jsonOut(['error' => 'Order not found'], 404);
            }

            $paymentId = uuid();
            execute(
                'INSERT INTO payments (id, order_id, amount, payment_method, reference_number, notes, recorded_by, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
                'ssdssss',
                [
                    $paymentId,
                    $r2,
                    $amount,
                    $b['paymentMethod'] ?? 'Manual',
                    $b['referenceNumber'] ?? null,
                    $b['notes'] ?? null,
                    $admin['id'] ?? null,
                ]
            );
            jsonOut(['data' => $computePaymentSummary($r2)], 201);
        }

        // PUT/PATCH /admin/orders/:id/payments/:paymentId
        if (($method === 'PUT' || $method === 'PATCH') && $r2 && $r3 === 'payments' && $r4) {
            $b = jsonBody();
            $existing = queryOne('SELECT id, order_id FROM payments WHERE id = ? AND order_id = ? LIMIT 1', 'ss', [$r4, $r2]);
            if (!$existing) {
                jsonOut(['error' => 'Payment not found'], 404);
            }

            $sets = [];
            $types = '';
            $vals = [];

            if (array_key_exists('amount', $b)) {
                $amount = (float)$b['amount'];
                if ($amount <= 0) {
                    jsonOut(['error' => 'Amount must be greater than 0'], 400);
                }
                $sets[] = 'amount = ?';
                $types .= 'd';
                $vals[] = $amount;
            }
            if (array_key_exists('paymentMethod', $b)) {
                $sets[] = 'payment_method = ?';
                $types .= 's';
                $vals[] = (string)$b['paymentMethod'];
            }
            if (array_key_exists('referenceNumber', $b)) {
                $sets[] = 'reference_number = ?';
                $types .= 's';
                $vals[] = $b['referenceNumber'] === null ? null : (string)$b['referenceNumber'];
            }
            if (array_key_exists('notes', $b)) {
                $sets[] = 'notes = ?';
                $types .= 's';
                $vals[] = $b['notes'] === null ? null : (string)$b['notes'];
            }

            if (!$sets) {
                jsonOut(['error' => 'No fields to update'], 400);
            }

            $sets[] = 'updated_at = NOW()';
            $types .= 'ss';
            $vals[] = $r4;
            $vals[] = $r2;

            execute('UPDATE payments SET ' . implode(', ', $sets) . ' WHERE id = ? AND order_id = ?', $types, $vals);
            jsonOut(['data' => $computePaymentSummary($r2)]);
        }

        // DELETE /admin/orders/:id/payments/:paymentId
        if ($method === 'DELETE' && $r2 && $r3 === 'payments' && $r4) {
            $payment = queryOne('SELECT id FROM payments WHERE id = ? AND order_id = ? LIMIT 1', 'ss', [$r4, $r2]);
            if (!$payment) {
                jsonOut(['error' => 'Payment not found'], 404);
            }
            execute('DELETE FROM payments WHERE id = ? AND order_id = ?', 'ss', [$r4, $r2]);
            jsonOut(['data' => $computePaymentSummary($r2)]);
        }

        // GET /admin/orders/:id
        if ($method === 'GET' && $r2) {
            $o = queryOne('SELECT * FROM orders WHERE id=? LIMIT 1','s',[$r2]);
            if (!$o) jsonOut(['error'=>'Order not found'],404);
            jsonOut(['data' => adminNormalizeOrder($o, true)]);
        }
        // GET /admin/orders
        if ($method === 'GET') {
            $status = strtolower($_GET['status']??'');
            $paymentStatus = strtolower($_GET['paymentStatus']??'');
            $size   = (int)($_GET['size']??20); $page = (int)($_GET['page']??0);
            if ($status) { $rows = queryAll("SELECT $ORDER_LIST FROM orders WHERE status=? ORDER BY created_at DESC",'s',[$status]); }
            else          { $rows = queryAll("SELECT $ORDER_LIST FROM orders ORDER BY created_at DESC"); }
            
            // Filter by payment status if provided
            if ($paymentStatus) {
                $rows = array_filter($rows, function($o) use ($paymentStatus) {
                    $payments = queryAll('SELECT amount FROM payments WHERE order_id = ?', 's', [$o['id']]);
                    $orderTotal = (float)($o['total'] ?? 0);
                    $amountCollected = array_sum(array_map(fn($p) => (float)$p['amount'], $payments));
                    $balanceDue = max(0, $orderTotal - $amountCollected);
                    $pStatus = $balanceDue <= 0 ? 'paid' : ($amountCollected > 0 ? 'partial payment' : 'unpaid');
                    return $pStatus === $paymentStatus;
                });
                $rows = array_values($rows);
            }
            
            $total = count($rows); $content = array_slice($rows, $page*$size, $size);
            jsonOut(['data'=>['content'=>array_map(fn($row) => adminNormalizeOrder($row, true), $content),'totalElements'=>$total,'totalPages'=>(int)ceil($total/$size)]]);
        }
        // PUT /admin/orders/:id/status
        if ($method === 'PUT' && $r2 && $r3 === 'status') {
            $b=jsonBody(); execute('UPDATE orders SET status=?,updated_at=NOW() WHERE id=?','ss',[strtolower($b['status']??'pending'),$r2]);
            jsonOut(['data'=>['id'=>$r2,'status'=>$b['status']]]);
        }
        // POST /admin/orders/:id/tracking
        if ($method === 'POST' && $r2 && $r3 === 'tracking') {
            $b=jsonBody(); $id=uuid();
            execute('INSERT INTO order_tracking (id,order_id,status,message,location,created_at) VALUES (?,?,?,?,?,NOW())','sssss',[$id,$r2,$b['status']??null,$b['message']??null,$b['location']??null]);
            jsonOut(['data'=>['id'=>$id]]);
        }
        // DELETE /admin/orders (reset all)
        if ($method === 'DELETE' && !$r2) {
            $orders = queryAll('SELECT id FROM orders');
            if ($orders) {
                $ids = array_column($orders,'id');
                $ph  = implode(',', array_fill(0, count($ids), '?'));
                $t   = str_repeat('s', count($ids));
                execute("DELETE FROM payments WHERE order_id IN ($ph)", $t, $ids);
                execute("DELETE FROM order_tracking WHERE order_id IN ($ph)", $t, $ids);
                execute("DELETE FROM order_attachments WHERE order_id IN ($ph)", $t, $ids);
                execute("DELETE FROM orders WHERE id IN ($ph)", $t, $ids);
            }
            execute("INSERT INTO counters (`key`,last_id) VALUES ('orders',100) ON DUPLICATE KEY UPDATE last_id=100");
            jsonOut(['data'=>[]]);
        }
    }

    // ══ CUSTOMERS ═════════════════════════════════════════════════════════════
    if ($r1 === 'customers') {
        if ($method === 'GET' && !$r2) {
            $search = $_GET['search']??''; $size=(int)($_GET['size']??20); $page=(int)($_GET['page']??0);
            $profiles = queryAll("SELECT id,name,email,role,status,created_at FROM profiles WHERE role='customer'");
            $orders   = queryAll("SELECT id,user_id,guest_email,guest_phone,guest_name,shipping_address,total,total_amount,created_at FROM orders ORDER BY created_at DESC");
            $regMap=[]; $guestMap=[];
            foreach($profiles as $p) $regMap[$p['id']]=['id'=>$p['id'],'name'=>$p['name'],'email'=>$p['email'],'role'=>$p['role'],'status'=>$p['status'],'createdAt'=>['seconds'=>toSeconds($p['created_at'])],'orderCount'=>0,'totalAmount'=>0,'isGuest'=>false];
            foreach($orders as $o) {
                $amt=(float)($o['total_amount']??$o['total']??0); $sa=parseJ($o['shipping_address'])??[];
                if ($o['user_id'] && isset($regMap[$o['user_id']])) { $regMap[$o['user_id']]['orderCount']++; $regMap[$o['user_id']]['totalAmount']+=$amt; }
                elseif (!$o['user_id']) {
                    $email=$o['guest_email']??$sa['email']??''; $phone=$o['guest_phone']??$sa['phone']??''; $key=$email?:$phone;
                    if (!$key) continue;
                    if (isset($guestMap[$key])) { $guestMap[$key]['orderCount']++; $guestMap[$key]['totalAmount']+=$amt; }
                    else $guestMap[$key]=['id'=>$key,'name'=>$o['guest_name']??$sa['fullName']??'Guest','email'=>$email,'phone'=>$phone,'status'=>'guest','createdAt'=>['seconds'=>toSeconds($o['created_at'])],'orderCount'=>1,'totalAmount'=>$amt,'isGuest'=>true];
                }
            }
            $all=array_merge(array_values($regMap),array_values($guestMap));
            usort($all,fn($a,$b)=>($b['createdAt']['seconds']??0)<=>($a['createdAt']['seconds']??0));
            if ($search) { $s=strtolower($search); $all=array_values(array_filter($all,fn($c)=>str_contains(strtolower($c['name']??''),$s)||str_contains(strtolower($c['email']??''),$s)||str_contains($c['phone']??'',$s))); }
            $total=count($all); jsonOut(['data'=>['content'=>array_slice($all,$page*$size,$size),'totalElements'=>$total]]);
        }
        if ($method === 'GET' && $r2) {
            if (str_contains($r2,'@')||preg_match('/^[0-9+]/',$r2)) {
                if(str_contains($r2,'@')) $rows=queryAll("SELECT * FROM orders WHERE user_id IS NULL AND (guest_email=? OR JSON_UNQUOTE(JSON_EXTRACT(shipping_address,'$.email'))=?) ORDER BY created_at ASC",'ss',[$r2,$r2]);
                else $rows=queryAll("SELECT * FROM orders WHERE user_id IS NULL AND (guest_phone=? OR phone=?) ORDER BY created_at ASC",'ss',[$r2,$r2]);
                if(!$rows) jsonOut(['data'=>null]);
                $first=$rows[0]; $sa=parseJ($first['shipping_address'])??[];
                jsonOut(['data'=>['id'=>$r2,'name'=>$first['guest_name']??$sa['fullName']??'Guest','email'=>$first['guest_email']??$sa['email']??'','phone'=>$first['guest_phone']??$sa['phone']??'','status'=>'guest','createdAt'=>['seconds'=>toSeconds($first['created_at'])],'orderCount'=>count($rows),'isGuest'=>true]]);
            }
            $p=queryOne('SELECT id,name,email,role,status,created_at FROM profiles WHERE id=? LIMIT 1','s',[$r2]);
            jsonOut(['data'=>$p?['id'=>$p['id'],'name'=>$p['name'],'email'=>$p['email'],'role'=>$p['role'],'status'=>$p['status'],'createdAt'=>['seconds'=>toSeconds($p['created_at'])]]:null]);
        }
        if ($method === 'PUT' && $r2 && $r3 === 'status') { $b=jsonBody(); execute('UPDATE profiles SET status=? WHERE id=?','ss',[$b['status'],$r2]); jsonOut(['data'=>['id'=>$r2,'status'=>$b['status']]]); }
        if ($method === 'PUT' && $r2) { $b=jsonBody();$sets=[];$types='';$vals=[];foreach(['name','email','status'] as $k){if(isset($b[$k])){$sets[]="$k=?";$types.='s';$vals[]=$b[$k];}} if($sets){$types.='s';$vals[]=$r2;execute('UPDATE profiles SET '.implode(',',$sets).' WHERE id=?',$types,$vals);} jsonOut(['data'=>array_merge(['id'=>$r2],$b)]); }
    }

    // ══ ANALYTICS ═════════════════════════════════════════════════════════════
    if ($r1 === 'analytics') {
        if ($r2 === 'dashboard') {
            $pc = (int)(queryOne('SELECT COUNT(*) as c FROM products')['c']??0);
            $oc = (int)(queryOne('SELECT COUNT(*) as c FROM orders')['c']??0);
            $cc = (int)(queryOne("SELECT COUNT(*) as c FROM profiles WHERE role='customer'")['c']??0);
            $recentOrders = queryAll('SELECT id,status,total FROM orders ORDER BY created_at DESC LIMIT 100');
            $rev=array_sum(array_column($recentOrders,'total'));
            $pending=count(array_filter($recentOrders,fn($o)=>$o['status']==='pending'));
            $processing=count(array_filter($recentOrders,fn($o)=>$o['status']==='processing'));
            $delivered=count(array_filter($recentOrders,fn($o)=>$o['status']==='delivered'));
            jsonOut(['data'=>['totalProducts'=>$pc,'totalOrders'=>$oc,'totalCustomers'=>$cc,'totalRevenue'=>$rev,'pendingOrders'=>$pending,'processingOrders'=>$processing,'deliveredOrders'=>$delivered,'monthlyRevenue'=>$rev,'monthlyOrders'=>$oc]]);
        }
        if ($r2 === 'orders') {
            $ORDER_LIST='id,order_number,user_id,email,phone,guest_email,guest_phone,guest_name,status,payment_method,total,total_amount,coupon_code,discount_amount,subtotal_amount,shipping_address,has_lr_copy,created_at,updated_at';
            jsonOut(['data'=>array_map('adminNormalizeOrder',queryAll("SELECT $ORDER_LIST FROM orders ORDER BY created_at DESC"))]);
        }
        if ($r2 === 'top-products') {
            $limit=(int)($_GET['limit']??10); $orders=queryAll('SELECT items FROM orders');
            $map=[];
            foreach($orders as $o){foreach((parseJ($o['items'])??[]) as $item){$key=$item['productId']??$item['name']??'unknown';if(!isset($map[$key]))$map[$key]=['name'=>$item['name']??$key,'qty'=>0,'revenue'=>0];$map[$key]['qty']+=(int)($item['quantity']??1);$map[$key]['revenue']+=(float)($item['price']??0)*(int)($item['quantity']??1);}}
            usort($map,fn($a,$b)=>$b['qty']<=>$a['qty']); $map=array_slice($map,0,$limit);
            jsonOut(['data'=>array_map(fn($p)=>['productName'=>$p['name'],'totalQuantity'=>$p['qty'],'totalRevenue'=>$p['revenue']],$map)]);
        }
        if ($r2 === 'orders-by-status') {
            $rows=queryAll('SELECT status FROM orders'); $counts=[];
            foreach($rows as $o) $counts[$o['status']]=($counts[$o['status']]??0)+1;
            jsonOut(['data'=>$counts]);
        }
        if ($r2 === 'revenue') {
            $rows=queryAll('SELECT total FROM orders');$total=array_sum(array_column($rows,'total'));
            jsonOut(['data'=>['revenue'=>$total,'orders'=>count($rows)]]);
        }
    }

    // ══ SETTINGS ══════════════════════════════════════════════════════════════
    if ($r1 === 'settings') {
        if ($r2 === 'store') {
            if ($method === 'GET')  jsonOut(['data' => adminGetSetting('store') ?? []]);
            if ($method === 'PUT') { $b=jsonBody(); adminUpsertSetting('store', array_filter($b, fn($v)=>$v!==null)); jsonOut(['data'=>$b]); }
        }
        if ($r2 === 'page-config') {
            if ($method === 'GET')  jsonOut(['data' => adminGetSetting('pageConfig') ?? ['sections'=>[]]]);
            if ($method === 'PUT') { adminUpsertSetting('pageConfig', jsonBody()); jsonOut(['data'=>jsonBody()]); }
            if ($method === 'POST' && $r3 === 'publish') {
                $cfg=adminGetSetting('pageConfig')??['sections'=>[]]; $cfg['published']=true;
                adminUpsertSetting('pageConfig',$cfg); jsonOut(['data'=>$cfg]);
            }
        }
    }

    // ══ COUPONS ════════════════════════════════════════════════════════════════
    if ($r1 === 'coupons') {
        $COLS='id,code,description,type,value,max_discount_amount,min_order_value,max_uses,max_uses_per_customer,valid_from,valid_until,is_active,used_count,created_at';
        if ($method==='GET'&&!$r2){ $rows=queryAll("SELECT $COLS FROM coupons ORDER BY created_at DESC"); jsonOut(['data'=>['content'=>array_map('adminNormalizeCoupon',$rows),'totalElements'=>count($rows)]]); }
        if ($method==='GET'&&$r2) { $c=queryOne("SELECT $COLS FROM coupons WHERE id=? LIMIT 1",'s',[$r2]); jsonOut(['data'=>$c?adminNormalizeCoupon($c):null]); }
        if ($method==='POST') {
            $c=jsonBody(); $id=uuid();
            execute("INSERT INTO coupons (id,code,description,type,value,max_discount_amount,min_order_value,max_uses,max_uses_per_customer,valid_from,valid_until,is_active,used_count,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,NOW())",
                'ssssdddiissi',[$id,strtoupper($c['code']),$c['description']??null,$c['type'],$c['value'],$c['maxDiscountAmount']??null,$c['minOrderValue']??null,$c['maxUses']??null,$c['maxUsesPerCustomer']??null,$c['validFrom']??null,$c['validUntil']??null,($c['isActive']??true)?1:0]);
            jsonOut(['data'=>adminNormalizeCoupon(queryOne("SELECT $COLS FROM coupons WHERE id=?",'s',[$id]))]);
        }
        if ($method==='PUT'&&$r2) {
            $c=jsonBody();$sets=[];$types='';$vals=[];
            $add=function($col,$val,$t) use(&$sets,&$types,&$vals){if($val!==null){$sets[]="$col=?";$types.=$t;$vals[]=$val;}};
            if(isset($c['code']))               $add('code',strtoupper($c['code']),'s');
            if(isset($c['description']))         $add('description',$c['description'],'s');
            if(isset($c['type']))                $add('type',$c['type'],'s');
            if(isset($c['value']))               $add('value',$c['value'],'d');
            if(isset($c['maxDiscountAmount']))    $add('max_discount_amount',$c['maxDiscountAmount'],'d');
            if(isset($c['minOrderValue']))        $add('min_order_value',$c['minOrderValue'],'d');
            if(isset($c['maxUses']))              $add('max_uses',$c['maxUses'],'i');
            if(isset($c['maxUsesPerCustomer']))   $add('max_uses_per_customer',$c['maxUsesPerCustomer'],'i');
            if(isset($c['validFrom']))            $add('valid_from',$c['validFrom'],'s');
            if(isset($c['validUntil']))           $add('valid_until',$c['validUntil'],'s');
            if(isset($c['isActive']))            {$sets[]='is_active=?';$types.='i';$vals[]=$c['isActive']?1:0;}
            if($sets){$types.='s';$vals[]=$r2;execute('UPDATE coupons SET '.implode(',',$sets).' WHERE id=?',$types,$vals);}
            jsonOut(['data'=>array_merge(['id'=>$r2],$c)]);
        }
        if ($method==='DELETE'&&$r2) { execute('DELETE FROM coupons WHERE id=?','s',[$r2]); jsonOut(['data'=>[]]); }
    }

    // ══ USERS (sub-admins) ════════════════════════════════════════════════════
    if ($r1 === 'users') {
        if ($method==='GET') {
            $rows=queryAll('SELECT id,uid,username,email,display_password,role,created_at FROM admin_users ORDER BY created_at DESC');
            jsonOut(['data'=>array_map(fn($u)=>['id'=>$u['id'],'uid'=>$u['uid'],'username'=>$u['username'],'email'=>$u['email'],'displayPassword'=>$u['display_password'],'role'=>$u['role'],'createdAt'=>['seconds'=>toSeconds($u['created_at'])]],$rows)]);
        }
        if ($method==='POST') {
            $b=jsonBody(); $username=strtolower(trim($b['username']??'')); $password=$b['password']??'';
            if (!$username||!$password) jsonOut(['error'=>'username and password required'],400);
            if (strlen($password)<6) jsonOut(['error'=>'Password must be at least 6 characters'],400);
            if (queryOne('SELECT id FROM admin_users WHERE username=? LIMIT 1','s',[$username])) jsonOut(['error'=>'Username already exists'],400);
            $email="$username@adminpanel.local"; $hash=password_hash($password,PASSWORD_BCRYPT); $userId=uuid();
            execute('INSERT INTO users (id,email,password_hash,created_at) VALUES (?,?,?,NOW())','sss',[$userId,$email,$hash]);
            execute('INSERT INTO profiles (id,name,email,role,status,created_at) VALUES (?,?,?,"subadmin","active",NOW())','sss',[$userId,$username,$email]);
            $adminId=uuid();
            execute('INSERT INTO admin_users (id,uid,username,email,display_password,role,created_by,created_at) VALUES (?,?,?,?,?,"subadmin",?,NOW())','sssssss',[$adminId,$userId,$username,$email,$password,$b['createdBy']??null]);
            jsonOut(['data'=>['id'=>$adminId,'uid'=>$userId,'username'=>$username,'email'=>$email,'role'=>'subadmin']]);
        }
        if ($method==='DELETE'&&$r2) {
            $u=queryOne('SELECT uid FROM admin_users WHERE id=? LIMIT 1','s',[$r2]);
            execute('DELETE FROM admin_users WHERE id=?','s',[$r2]);
            if ($u&&$u['uid']) execute('DELETE FROM users WHERE id=?','s',[$u['uid']]);
            jsonOut(['data'=>[]]);
        }
    }

    jsonOut(['error' => 'Not found'], 404);
}
