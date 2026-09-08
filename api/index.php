<?php
require_once __DIR__ . '/config.php';

// ── CORS — handle OPTIONS preflight immediately ──────────────────────────────
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Access-Control-Max-Age: 86400');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Route the request ────────────────────────────────────────────────────────
$method = $_SERVER['REQUEST_METHOD'];
$uri    = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$uri    = '/' . ltrim(preg_replace('#^/api#', '', $uri), '/');

// Health check
if ($uri === '/health' || $uri === '/health/') {
    jsonOut(['status' => 'ok', 'timestamp' => date('c')]);
}

// ── Route dispatch ───────────────────────────────────────────────────────────
$segments = array_values(array_filter(explode('/', $uri)));

$r0 = $segments[0] ?? '';
$r1 = $segments[1] ?? '';
$r2 = $segments[2] ?? '';
$r3 = $segments[3] ?? '';
$r4 = $segments[4] ?? '';

switch ($r0) {
    case 'auth':
        require_once __DIR__ . '/routes/auth.php';
        routeAuth($method, $r1, $r2);
        break;
    case 'products':
        require_once __DIR__ . '/routes/products.php';
        routeProducts($method, $r1, $r2);
        break;
    case 'categories':
        require_once __DIR__ . '/routes/categories.php';
        routeCategories($method, $r1);
        break;
    case 'orders':
        require_once __DIR__ . '/routes/orders.php';
        routeOrders($method, $r1, $r2);
        break;
    case 'payments':
        require_once __DIR__ . '/routes/payments.php';
        routePayments($method, $r1, $r2);
        break;
    case 'coupons':
        require_once __DIR__ . '/routes/coupons.php';
        routeCoupons($method, $r1);
        break;
    case 'settings':
        require_once __DIR__ . '/routes/settings.php';
        routeSettings($method, $r1, $r2);
        break;
    case 'admin':
        require_once __DIR__ . '/routes/admin.php';
        routeAdmin($method, $r1, $r2, $r3, $r4);
        break;
    case 'upload':
        require_once __DIR__ . '/routes/upload.php';
        routeUpload($method, $r1, $r2, $r3);
        break;
    default:
        jsonOut(['error' => 'Not found'], 404);
}
