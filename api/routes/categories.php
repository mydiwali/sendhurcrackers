<?php
function routeCategories(string $method, string $seg1): void {
    // GET /categories/tree
    if ($method === 'GET' && $seg1 === 'tree') {
        $rows = queryAll('SELECT id, name, slug, parent_id, sort_order FROM categories ORDER BY sort_order ASC');
        $cats = array_map(fn($c) => ['id'=>$c['id'],'name'=>$c['name'],'slug'=>$c['slug'],'parentId'=>$c['parent_id'],'sortOrder'=>(int)$c['sort_order']], $rows);
        $roots = array_values(array_filter($cats, fn($c) => !$c['parentId']));
        foreach ($roots as &$r) {
            $r['children'] = array_values(array_filter($cats, fn($c) => $c['parentId'] === $r['id']));
        }
        jsonOut(['data' => $roots]);
    }

    // GET /categories
    if ($method === 'GET') {
        $rows = queryAll('SELECT id, name, slug, description, image_url, parent_id, sort_order, is_active, created_at FROM categories ORDER BY sort_order ASC');
        jsonOut(['data' => array_map(fn($c) => [
            'id' => $c['id'], 'name' => $c['name'], 'slug' => $c['slug'],
            'description' => $c['description'], 'imageUrl' => $c['image_url'],
            'parentId' => $c['parent_id'], 'sortOrder' => (int)$c['sort_order'],
            'isActive' => (bool)$c['is_active'],
            'createdAt' => ['seconds' => toSeconds($c['created_at'])],
        ], $rows)]);
    }

    jsonOut(['error' => 'Not found'], 404);
}
