# Project Documentation

Overview of the project architecture and design decisions.

## Getting Started

To begin working with this project, you need to install the dependencies:

```bash
npm install
npm run build
npm run test
```

Make sure you have Node.js v18 or later installed.

## Configuration

The configuration file supports the following options:

| Option     | Type    | Default   | Description            |
| ---------- | ------- | --------- | ---------------------- |
| port       | number  | 3000      | Server port            |
| host       | string  | localhost | Bind address           |
| debug      | boolean | false     | Enable debug logging   |
| timeout    | number  | 30000     | Request timeout in ms  |
| maxRetries | number  | 3         | Maximum retry attempts |

## Authentication

The auth system uses JWT tokens with PKCE flow. Here's how it works:

1. Client requests authorization
2. Server validates credentials
3. Token is issued with configurable expiry
4. Refresh tokens rotate automatically

```typescript
interface AuthConfig {
  secret: string;
  expiresIn: number;
  refreshWindow: number;
  issuer: string;
}

function createToken(user: User, config: AuthConfig): string {
  return jwt.sign({ sub: user.id, role: user.role }, config.secret, {
    expiresIn: config.expiresIn,
    issuer: config.issuer,
  });
}
```

> **Note:** Always store secrets in environment variables, never in code.

## Database Schema

The database uses PostgreSQL with the following core tables:

| Table     | Columns                           | Indexes                    | Description       |
| --------- | --------------------------------- | -------------------------- | ----------------- |
| users     | id, email, name, role, created_at | email (unique), role       | User accounts     |
| sessions  | id, user_id, token, expires_at    | user_id, token, expires_at | Active sessions   |
| audit_log | id, user_id, action, metadata, ts | user_id, ts                | Audit trail       |
| settings  | id, key, value, updated_at        | key (unique)               | App configuration |

### Migrations

Run migrations with:

```bash
npx prisma migrate dev
npx prisma generate
```

### Seed Data

```sql
INSERT INTO users (email, name, role) VALUES
  ('admin@example.com', 'Admin', 'admin'),
  ('user@example.com', 'User', 'user');

INSERT INTO settings (key, value) VALUES
  ('app.name', 'MyApp'),
  ('app.version', '1.0.0'),
  ('feature.darkMode', 'true');
```

## API Endpoints

### Users

- `GET /api/users` — List all users (admin only)
- `GET /api/users/:id` — Get user by ID
- `POST /api/users` — Create new user
- `PUT /api/users/:id` — Update user
- `DELETE /api/users/:id` — Delete user

### Sessions

- `POST /api/auth/login` — Create session
- `POST /api/auth/refresh` — Refresh token
- `DELETE /api/auth/logout` — Destroy session

```typescript
app.get("/api/users", authMiddleware("admin"), async (req, res) => {
  const users = await db.user.findMany({
    select: { id: true, email: true, name: true, role: true },
    orderBy: { createdAt: "desc" },
  });
  res.json({ data: users });
});

app.post("/api/users", authMiddleware("admin"), async (req, res) => {
  const { email, name, role } = req.body;
  const user = await db.user.create({
    data: { email, name, role },
  });
  res.status(201).json({ data: user });
});
```

## Error Handling

All errors follow a consistent format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid email format",
    "details": [{ "field": "email", "constraint": "isEmail" }]
  }
}
```

Error codes:

| Code             | HTTP Status | Description               |
| ---------------- | ----------- | ------------------------- |
| VALIDATION_ERROR | 400         | Request validation failed |
| UNAUTHORIZED     | 401         | Missing or invalid token  |
| FORBIDDEN        | 403         | Insufficient permissions  |
| NOT_FOUND        | 404         | Resource not found        |
| CONFLICT         | 409         | Duplicate resource        |
| RATE_LIMITED     | 429         | Too many requests         |
| INTERNAL_ERROR   | 500         | Unexpected server error   |

## Deployment

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist/ ./dist/
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Environment Variables

| Variable     | Required | Description                  |
| ------------ | -------- | ---------------------------- |
| DATABASE_URL | Yes      | PostgreSQL connection string |
| JWT_SECRET   | Yes      | Token signing secret         |
| PORT         | No       | Server port (default: 3000)  |
| LOG_LEVEL    | No       | Logging verbosity            |
| REDIS_URL    | No       | Cache connection string      |

## Monitoring

The application exposes Prometheus metrics at `/metrics`:

- `http_request_duration_seconds` — Request latency histogram
- `http_requests_total` — Request counter by status code
- `db_query_duration_seconds` — Database query latency
- `active_sessions_gauge` — Currently active sessions

```yaml
# prometheus.yml
scrape_configs:
  - job_name: "myapp"
    scrape_interval: 15s
    static_configs:
      - targets: ["localhost:3000"]
```

## Testing

### Unit Tests

```bash
npm run test:unit
```

### Integration Tests

```bash
npm run test:integration
```

### Coverage

| Module     | Statements | Branches | Functions | Lines |
| ---------- | ---------- | -------- | --------- | ----- |
| auth       | 95%        | 88%      | 100%      | 94%   |
| users      | 91%        | 82%      | 95%       | 90%   |
| sessions   | 87%        | 79%      | 90%       | 86%   |
| settings   | 98%        | 95%      | 100%      | 97%   |
| middleware | 85%        | 75%      | 88%       | 84%   |

## Changelog

### v1.2.0

- Added rate limiting middleware
- Improved error handling consistency
- Added audit logging for admin actions

### v1.1.0

- Added session refresh mechanism
- Fixed token expiry edge case
- Improved database query performance

### v1.0.0

- Initial release
- User management API
- JWT authentication
- PostgreSQL integration
