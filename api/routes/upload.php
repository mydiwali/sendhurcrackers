<?php
function routeUpload(string $method, string $r1, string $r2, string $r3): void {
    requireAdmin();
    $uploadRoot = UPLOAD_DIR;
    $backendUrl = BACKEND_URL;

    // POST /upload/product-images/:productId
    if ($method === 'POST' && $r1 === 'product-images' && $r2) {
        $productId = $r2;
        if (empty($_FILES['file'])) jsonOut(['error' => 'No file uploaded'], 400);

        $file = $_FILES['file'];
        if ($file['size'] > 5 * 1024 * 1024) jsonOut(['error' => 'File exceeds 5MB limit'], 400);

        $dir = "$uploadRoot/product-images/$productId";
        if (!is_dir($dir)) mkdir($dir, 0755, true);

        $ext      = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION)) ?: 'jpg';
        $filename = time() . '.' . $ext;
        $dest     = "$dir/$filename";

        if (!move_uploaded_file($file['tmp_name'], $dest)) jsonOut(['error' => 'Upload failed'], 500);

        $storagePath = "product-images/$productId/$filename";
        $publicUrl   = "$backendUrl/api/uploads/$storagePath";

        $isPrimary = ($_POST['isPrimary'] ?? 'false') === 'true';
        $existing  = queryOne('SELECT id FROM product_images WHERE product_id = ? LIMIT 1', 's', [$productId]);
        $makePrimary = $isPrimary || !$existing;

        $imgId = uuid();
        execute('INSERT INTO product_images (id, product_id, url, thumbnail_url, is_primary, sort_order, storage_path) VALUES (?, ?, ?, ?, ?, 0, ?)',
            'ssssis', [$imgId, $productId, $publicUrl, $publicUrl, $makePrimary ? 1 : 0, $storagePath]);

        if ($makePrimary) execute('UPDATE products SET primary_image_url = ? WHERE id = ?', 'ss', [$publicUrl, $productId]);

        jsonOut(['data' => ['id' => $imgId, 'url' => $publicUrl, 'thumbnailUrl' => $publicUrl, 'isPrimary' => $makePrimary]]);
    }

    // DELETE /upload/product-images/:productId/:imageId
    if ($method === 'DELETE' && $r1 === 'product-images' && $r2 && $r3) {
        $productId = $r2; $imageId = $r3;
        $img = queryOne('SELECT storage_path, is_primary FROM product_images WHERE id = ? LIMIT 1', 's', [$imageId]);
        if (!$img) jsonOut(['error' => 'Image not found'], 404);

        execute('DELETE FROM product_images WHERE id = ?', 's', [$imageId]);

        if ($img['storage_path']) {
            $filePath = "$uploadRoot/{$img['storage_path']}";
            if (file_exists($filePath)) unlink($filePath);
        }

        if ($img['is_primary']) {
            $remaining = queryOne('SELECT url FROM product_images WHERE product_id = ? ORDER BY sort_order ASC LIMIT 1', 's', [$productId]);
            execute('UPDATE products SET primary_image_url = ? WHERE id = ?', 'ss', [$remaining['url'] ?? null, $productId]);
        }
        jsonOut(['data' => []]);
    }

    // POST /upload/order-attachments/:orderId
    if ($method === 'POST' && $r1 === 'order-attachments' && $r2) {
        $orderId = $r2;
        if (empty($_FILES['file'])) jsonOut(['error' => 'No file uploaded'], 400);

        $file = $_FILES['file'];
        if ($file['size'] > 15 * 1024 * 1024) jsonOut(['error' => 'File exceeds 15MB limit'], 400);

        $dir = "$uploadRoot/order-attachments/$orderId";
        if (!is_dir($dir)) mkdir($dir, 0755, true);

        $ext      = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION)) ?: 'jpg';
        $filename = "lr-copy.$ext";
        $dest     = "$dir/$filename";

        if (!move_uploaded_file($file['tmp_name'], $dest)) jsonOut(['error' => 'Upload failed'], 500);

        $storagePath = "order-attachments/$orderId/$filename";
        $publicUrl   = "$backendUrl/api/uploads/$storagePath";
        $id = uuid();

        execute("INSERT INTO order_attachments (id, order_id, type, url, file_type, storage_path, uploaded_at)
                 VALUES (?, ?, 'lr-copy', ?, ?, ?, NOW())
                 ON DUPLICATE KEY UPDATE url=VALUES(url), file_type=VALUES(file_type), storage_path=VALUES(storage_path), uploaded_at=NOW()",
            'sssss', [$id, $orderId, $publicUrl, $file['type'], $storagePath]);
        execute('UPDATE orders SET has_lr_copy = 1, updated_at = NOW() WHERE id = ?', 's', [$orderId]);

        jsonOut(['data' => ['url' => $publicUrl]]);
    }

    jsonOut(['error' => 'Not found'], 404);
}
