# Connectly — Mini Social Media Platform

## Features
- Register/login using bcrypt password hashing and JWT authentication
- Editable user profile and bio
- Create posts, browse the community feed
- Like/unlike posts
- Add comments to posts
- Discover users and follow/unfollow them
- Responsive HTML/CSS/JavaScript interface

## Run locally
1. Install Node.js 18+ and MongoDB, or create a MongoDB Atlas database.
2. Open this folder in a terminal.
3. Run `npm install`.
4. Copy `.env.example` to `.env` and edit `MONGODB_URI` and `JWT_SECRET`.
5. Run `npm start`.
6. Open `http://localhost:5001`.

The API and frontend are served from the same Express server. Do not publish real secrets in GitHub. For production, add rate limiting, stricter CORS, input validation, pagination, and moderation.
