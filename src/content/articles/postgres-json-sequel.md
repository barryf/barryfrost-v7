---
title: "Using JSON in Postgres with Ruby and Sequel"
date: 2017-10-10
tags:
  - postgres
  - sequel
  - json
  - jsonb
  - ruby
syndication:
  - https://medium.com/@barryf/using-json-in-postgres-with-ruby-and-sequel-897304158374
  - https://twitter.com/barryf/status/917858023191842818
standardRkey: 3ev6ryjws2222
---

With its fast, built-in support for JSON, it's worth considering Postgres for storing and querying your JSON data. Instead of using a specialised document server, Postgres may be the right choice for your application.

As of [Postgres 9.4][pg94] you can index data stored in a JSONB (binary JSON) column using GIN ("Generalised Inverted Index") indexes. JSONB/GIN provides special operators to efficiently and rapidly query data.

And for Ruby developers, the [Sequel][] gem offers a collection of convenient methods that make it easy to query Postgres JSONB columns.

## Example usage

First, install the `sequel_pg` gem:

```sh
$ gem install sequel_pg
```

Next, create a table with a JSONB column and a GIN index and add some sample JSON data:

```sql
-- Create a table with a JSONB column
CREATE TABLE posts (permalink VARCHAR(255) PRIMARY KEY, data JSONB);

-- Add an index using GIN
CREATE INDEX posts_gin ON posts USING GIN(data);

-- Insert a row with a JSON document
INSERT INTO posts VALUES ('/2017/10/my-post', '{
    "title": "My post",
    "content": "This is a new post that I have created.",
    "category": [
        "ruby",
        "postgres"
    ],
    "published": "2017-10-10T16:05:10Z"
}');
```

And then in Ruby:

```rb
# Require the Sequel gem
require 'sequel'

# Include the Postgres JSON Operations extension
Sequel.extension(:pg_json_ops)

# Connect to your Postgres instance via your database URL
DB = Sequel.connect(DATABASE_URL)

# Ask Sequel to use the Postgres JSON extension with your database
DB.extension(:pg_json)

# Create a JSONB Operation object for the "data" jsonb column in our table
data = Sequel.pg_jsonb_op(:data)

# Find posts containing title "My post"
DB[:posts].where(data.get_text('title') => 'My post')

# Find posts where the category array has a "postgres" value
DB[:posts].where(data['category'].contains(['postgres']))

# Find posts where the first value in the category array is "ruby"
DB[:posts].where(data['category'].get_text(0) => 'ruby')

# Find posts which have a content key
DB[:posts].where(data.has_key?('content'))

# Find posts sorted by the date published
DB[:posts].order(data['published'])
```

Read the [Sequel documentation][sequeldocs] for further methods supported by the `pg_json_ops` extension.

## The right choice?

Postgres is a great solution for JSON in your application, especially if you are already using Postgres for structured data in other tables. It offers easy storage and, with GIN indexes and the Sequel gem, you get fast querying of data from Ruby.

Where it may not be the right choice is if your use-case requires frequent partial updates to JSON documents. You can of course retrieve the JSON blob, parse it, update the value in the hash, convert back to JSON and then update the column, but a dedicated document database like MongoDB may be a better option.

[sequel]: http://sequel.jeremyevans.net
[pg94]: https://www.postgresql.org/docs/9.4/static/release-9-4.html
[sequeldocs]: http://sequel.jeremyevans.net/rdoc-plugins/files/lib/sequel/extensions/pg_json_ops_rb.html
