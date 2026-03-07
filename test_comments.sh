#!/bin/bash
HOST="http://localhost:8080"
# Login
LOGIN_RES=$(curl -s -X POST $HOST/api/login -H "Content-Type: application/json" -d '{"identifier":"testusr","password":"Password1"}')
TOKEN=$(echo "$LOGIN_RES" | grep -o '"token":"[^"]*' | cut -d'"' -f4)

# Get posts
POSTS=`curl -s -X GET $HOST/api/posts -H "Authorization: Bearer $TOKEN"`
POST_ID=$(echo "$POSTS" | grep -o '\"id\":\"[^\"]*' | head -1 | awk -F '"' '{print $4}')

# Try to comment again
curl -s -v -X POST $HOST/api/comments/create -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d "{\"post_id\":\"$POST_ID\",\"content\":\"This is a comment test that is long enough\"}"
