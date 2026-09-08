<?php
function normalizeProduct(array $p): array {
    return [
        'id'              => $p['id'],
        'name'            => $p['name'],
        'nameInTamil'     => $p['name_in_tamil'] ?? null,
        'slug'            => $p['slug'],
        'description'     => $p['description'] ?? null,
        'price'           => $p['price'] !== null ? (float)$p['price'] : null,
        'originalPrice'   => $p['original_price'] !== null ? (float)$p['original_price'] : null,
        'comparePrice'    => $p['original_price'] !== null ? (float)$p['original_price'] : null,
        'sku'             => $p['sku'] ?? null,
        'stock'           => (int)($p['stock'] ?? 0),
        'categoryId'      => $p['category_id'] ?? null,
        'active'          => (bool)$p['active'],
        'isFeatured'      => (bool)$p['is_featured'],
        'avgRating'       => $p['avg_rating'] !== null ? (float)$p['avg_rating'] : null,
        'primaryImageUrl' => $p['primary_image_url'] ?? '',
        'productNumber'   => $p['product_number'] ?? null,
        'createdAt'       => ['seconds' => toSeconds($p['created_at'])],
    ];
}

function routeProducts(string $method, string $seg1, string $seg2): void {
    // GET /products  (list)
    if ($method === 'GET' && !$seg1) {
        $page     = max(0, (int)($_GET['page'] ?? 0));
        $size     = max(1, min(100, (int)($_GET['size'] ?? 12)));
        $catId    = $_GET['categoryId'] ?? '';
        $search   = $_GET['search'] ?? '';
        $sort     = $_GET['sort'] ?? '';
        $minPrice = $_GET['minPrice'] ?? null;
        $maxPrice = $_GET['maxPrice'] ?? null;

        $where = ['p.active = 1']; $types = ''; $params = [];

        if ($catId && $catId !== 'uncategorized') {
            $where[] = 'p.category_id = ?'; $types .= 's'; $params[] = $catId;
        }
        if ($search) {
            $where[] = '(p.name LIKE ? OR p.description LIKE ? OR p.sku LIKE ?)';
            $t = "%$search%"; $types .= 'sss'; array_push($params, $t, $t, $t);
        }
        if ($minPrice !== null) { $where[] = 'p.price >= ?'; $types .= 'd'; $params[] = (float)$minPrice; }
        if ($maxPrice !== null) { $where[] = 'p.price <= ?'; $types .= 'd'; $params[] = (float)$maxPrice; }

        $whereSQL = $where ? 'WHERE ' . implode(' AND ', $where) : '';

        $orderBy = match($sort) {
            'price_asc'  => 'p.price ASC',
            'price_desc' => 'p.price DESC',
            'name_asc'   => 'p.name ASC',
            'featured'   => 'p.is_featured DESC, p.avg_rating DESC, p.created_at DESC',
            'latest'     => 'p.created_at DESC',
            default      => 'ISNULL(p.product_number), p.product_number ASC, p.created_at DESC',
        };

        $countRow = queryOne("SELECT COUNT(*) as total FROM products p $whereSQL", $types, $params);
        $total = (int)($countRow['total'] ?? 0);

        $rows = queryAll(
            "SELECT p.id, p.name, p.name_in_tamil, p.slug, p.price, p.original_price, p.sku,
                    p.stock, p.category_id, p.active, p.is_featured, p.avg_rating,
                    p.primary_image_url, p.product_number, p.created_at
             FROM products p $whereSQL ORDER BY $orderBy LIMIT ? OFFSET ?",
            $types . 'ii', array_merge($params, [$size, $page * $size])
        );

        jsonOut(['data' => [
            'content'       => array_map('normalizeProduct', $rows),
            'totalElements' => $total,
            'totalPages'    => (int)ceil($total / $size),
            'number'        => $page,
        ]]);
    }

    // GET /products/:slug/images
    if ($method === 'GET' && $seg1 && $seg2 === 'images') {
        $prod = queryOne('SELECT id FROM products WHERE slug = ? LIMIT 1', 's', [$seg1]);
        if (!$prod) jsonOut(['data' => []]);
        $imgs = queryAll(
            'SELECT id, url, thumbnail_url, is_primary, sort_order FROM product_images WHERE product_id = ? ORDER BY sort_order ASC',
            's', [$prod['id']]
        );
        jsonOut(['data' => array_map(fn($i) => [
            'id' => $i['id'], 'url' => $i['url'], 'thumbnailUrl' => $i['thumbnail_url'],
            'isPrimary' => (bool)$i['is_primary'], 'sortOrder' => (int)$i['sort_order'],
        ], $imgs)]);
    }

    // GET /products/:slug
    if ($method === 'GET' && $seg1) {
        $row = queryOne(
            'SELECT id, name, name_in_tamil, slug, description, price, original_price, sku,
                    stock, category_id, active, is_featured, avg_rating, primary_image_url,
                    product_number, created_at
             FROM products WHERE slug = ? LIMIT 1',
            's', [$seg1]
        );
        jsonOut(['data' => $row ? normalizeProduct($row) : null]);
    }

    jsonOut(['error' => 'Not found'], 404);
}
