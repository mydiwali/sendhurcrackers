<?php
function routeAuth(string $method, string $seg1, string $seg2): void {
    // POST /auth/register
    if ($method === 'POST' && $seg1 === 'register') {
        $b = jsonBody();
        $email = strtolower(trim($b['email'] ?? ''));
        $password = $b['password'] ?? '';
        $name = trim($b['name'] ?? '');
        $nameInTamil = trim($b['nameInTamil'] ?? '');

        if (!$email || !$password || !$name) jsonOut(['error' => 'email, password and name are required'], 400);

        if (queryOne('SELECT id FROM users WHERE email = ?', 's', [$email])) {
            jsonOut(['error' => 'Email already in use'], 400);
        }

        $hash   = password_hash($password, PASSWORD_BCRYPT);
        $userId = uuid();

        execute('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, NOW())', 'sss', [$userId, $email, $hash]);
        execute('INSERT INTO profiles (id, name, email, name_in_tamil, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
            'ssssss', [$userId, $name, $email, $nameInTamil ?: null, 'customer', 'active']);

        $token = jwtEncode(['id' => $userId, 'email' => $email, 'role' => 'customer']);
        jsonOut(['data' => ['user' => ['id' => $userId, 'name' => $name, 'email' => $email, 'role' => 'customer'], 'accessToken' => $token]]);
    }

    // POST /auth/login
    if ($method === 'POST' && $seg1 === 'login') {
        $b = jsonBody();
        $email    = strtolower(trim($b['email'] ?? ''));
        $password = $b['password'] ?? '';

        if (!$email || !$password) jsonOut(['error' => 'email and password are required'], 400);

        $user = queryOne('SELECT id, email, password_hash FROM users WHERE email = ?', 's', [$email]);
        if (!$user || !password_verify($password, $user['password_hash'])) {
            jsonOut(['error' => 'Invalid login credentials'], 401);
        }

        $profile = queryOne('SELECT name, email, name_in_tamil, role FROM profiles WHERE id = ?', 's', [$user['id']]);
        execute('UPDATE profiles SET last_login = NOW(), status = "active" WHERE id = ?', 's', [$user['id']]);

        $role  = $profile['role'] ?? 'customer';
        $token = jwtEncode(['id' => $user['id'], 'email' => $user['email'], 'role' => $role]);
        jsonOut(['data' => ['user' => ['id' => $user['id'], 'name' => $profile['name'] ?? '', 'email' => $user['email'], 'role' => $role], 'accessToken' => $token]]);
    }

    // POST /auth/logout
    if ($method === 'POST' && $seg1 === 'logout') {
        jsonOut(['data' => []]);
    }

    // GET /auth/profile
    if ($method === 'GET' && $seg1 === 'profile') {
        $authUser = requireAuth();
        $profile  = queryOne('SELECT name, email, name_in_tamil, role, status FROM profiles WHERE id = ?', 's', [$authUser['id']]);
        if (!$profile) jsonOut(['error' => 'Profile not found'], 404);
        jsonOut(['data' => array_merge(['id' => $authUser['id']], $profile)]);
    }

    // PUT /auth/profile
    if ($method === 'PUT' && $seg1 === 'profile') {
        $authUser = requireAuth();
        $b = jsonBody();
        $sets = []; $types = ''; $vals = [];
        if (isset($b['name']))          { $sets[] = 'name = ?';         $types .= 's'; $vals[] = $b['name']; }
        if (isset($b['name_in_tamil'])) { $sets[] = 'name_in_tamil = ?'; $types .= 's'; $vals[] = $b['name_in_tamil']; }
        if ($sets) {
            $types .= 's'; $vals[] = $authUser['id'];
            execute('UPDATE profiles SET ' . implode(', ', $sets) . ' WHERE id = ?', $types, $vals);
        }
        jsonOut(['data' => ['success' => true]]);
    }

    // GET /auth/addresses
    if ($method === 'GET' && $seg1 === 'addresses') {
        $authUser = requireAuth();
        $rows = queryAll('SELECT id, data FROM user_addresses WHERE user_id = ?', 's', [$authUser['id']]);
        $addresses = array_map(fn($r) => array_merge(['id' => $r['id']], parseJ($r['data']) ?? []), $rows);
        jsonOut(['data' => $addresses]);
    }

    // POST /auth/addresses
    if ($method === 'POST' && $seg1 === 'addresses') {
        $authUser = requireAuth();
        $id = uuid();
        execute('INSERT INTO user_addresses (id, user_id, data, created_at) VALUES (?, ?, ?, NOW())',
            'sss', [$id, $authUser['id'], json_encode(jsonBody())]);
        jsonOut(['data' => ['id' => $id]]);
    }

    jsonOut(['error' => 'Not found'], 404);
}
