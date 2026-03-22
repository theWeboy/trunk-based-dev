{
  "id": "",
  "lang": "typescript",
  "name": "trunk-based-dev",
  "description": "Minimal Encore app for trunk-based development and CI/CD pipeline testing",
  "global_cors": {
    "allow_origins_without_credentials": ["*"],
    "allow_origins_with_credentials": [
      "http://localhost:3000",
      "http://localhost:5173",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:5173"
    ],
    "allow_headers": ["Authorization", "Content-Type", "X-Request-ID"],
    "expose_headers": ["X-Request-ID"],
    "allow_private_network_access": true
  }
}
