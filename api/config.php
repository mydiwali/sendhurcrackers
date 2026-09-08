<?php
// ── Database config — fill these with Hostinger MySQL values ─────────────────
define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
define('DB_USER', getenv('DB_USER') ?: 'root');
define('DB_PASS', getenv('DB_PASS') ?: '');
define('DB_NAME', getenv('DB_NAME') ?: 'diwali_crackers');

// ── JWT Secret ───────────────────────────────────────────────────────────────
define('JWT_SECRET', getenv('JWT_SECRET') ?: 'REPLACE_WITH_64_CHAR_SECRET');

// ── Backend public URL ───────────────────────────────────────────────────────
define('BACKEND_URL', getenv('BACKEND_URL') ?: 'https://mydiwalicrackers.com');
define('UPLOAD_DIR',  __DIR__ . '/uploads');

// ── MySQL connection (singleton) ─────────────────────────────────────────────
function db(): mysqli {
    static $conn = null;
    if ($conn === null) {
        $conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
        if ($conn->connect_error) {
            http_response_code(500);
            die(json_encode(['error' => 'DB connection failed: ' . $conn->connect_error]));
        }
        $conn->set_charset('utf8mb4');
    }
    return $conn;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function jsonOut(mixed $data, int $status = 200): never {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function jsonBody(): array {
    return json_decode(file_get_contents('php://input'), true) ?? [];
}

function uuid(): string {
    return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0,0xffff), mt_rand(0,0xffff), mt_rand(0,0xffff),
        mt_rand(0,0x0fff)|0x4000, mt_rand(0,0x3fff)|0x8000,
        mt_rand(0,0xffff), mt_rand(0,0xffff), mt_rand(0,0xffff));
}

function queryOne(string $sql, string $types = '', array $params = []): ?array {
    $stmt = db()->prepare($sql);
    if ($params) $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ?: null;
}

function queryAll(string $sql, string $types = '', array $params = []): array {
    $stmt = db()->prepare($sql);
    if ($params) $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
    return $rows;
}

function execute(string $sql, string $types = '', array $params = []): int {
    $stmt = db()->prepare($sql);
    if ($params) $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $affected = $stmt->affected_rows;
    $stmt->close();
    return $affected;
}

// ── Minimal JWT (HS256) ───────────────────────────────────────────────────────
function jwtEncode(array $payload, int $expSeconds = 604800): string {
    $header  = base64url_encode(json_encode(['alg'=>'HS256','typ'=>'JWT']));
    $payload['iat'] = time();
    $payload['exp'] = time() + $expSeconds;
    $p   = base64url_encode(json_encode($payload));
    $sig = base64url_encode(hash_hmac('sha256', "$header.$p", JWT_SECRET, true));
    return "$header.$p.$sig";
}

function jwtDecode(string $token): ?array {
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;
    [$h, $p, $sig] = $parts;
    $expected = base64url_encode(hash_hmac('sha256', "$h.$p", JWT_SECRET, true));
    if (!hash_equals($expected, $sig)) return null;
    $payload = json_decode(base64url_decode($p), true);
    if (!$payload || $payload['exp'] < time()) return null;
    return $payload;
}

function base64url_encode(string $data): string {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}
function base64url_decode(string $data): string {
    return base64_decode(strtr($data, '-_', '+/') . str_repeat('=', 3 - (3 + strlen($data)) % 4));
}

function getAuthUser(): ?array {
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    $token = str_starts_with($auth, 'Bearer ') ? substr($auth, 7) : $auth;
    if (!$token) return null;
    return jwtDecode($token);
}

function requireAuth(): array {
    $user = getAuthUser();
    if (!$user) { jsonOut(['error' => 'Not authenticated'], 401); }
    return $user;
}

function requireAdmin(): array {
    $user = getAuthUser();
    if (!$user) { jsonOut(['error' => 'Not authenticated'], 401); }
    if (!in_array($user['role'] ?? '', ['admin', 'subadmin'])) {
        jsonOut(['error' => 'Admin access required'], 403);
    }
    return $user;
}

function parseJ(mixed $v): mixed {
    if (is_string($v)) return json_decode($v, true);
    return $v;
}

function toSeconds(mixed $dt): int {
    if (!$dt) return 0;
    return (int)(new DateTime($dt))->getTimestamp();
}
