# NATS.ws Auth Demo

The NATS.ws Auth Demo is a _simple_ end-to-end example of using [nats.ws](https://github.com/nats-io/nats.ws).
While I am describing it as _simple_, the example is fairly large and contains a number of moving pieces, 
but the important parts, are the following three:

- It uses a federated identity provider (Google)
- Using information from the federated identity provider, the system generates a user JWT on the fly.
- The user JWT sets permissions on subjects the user's client can publish and subscribe to.

The above functionality is implemented in [`main.go`](main.go), a very simple HTTP server, that has 2 functions:

- It serves all assets under a specified `contentDir`
- It handles POST requests for authentication at `/api/token`

The parts start motion on the client-side: the browser loads [`content_root/index.html`](content_root/index.html).
The page is simply a splash screen with a login button. The login button invokes the federated identity provider.
If authentication succeeds, the federated authentication provider generates a JWT that provides some basic 
information about the user, and invokes the `onsucess` handler. In case of a failure it invokes the configured 
`onfailure` handler. Different authentication systems will sport different APIs but in general
 the workflow will be analogous.
 
The `onsuccess` handler when invoked, performs a client redirect to `/api/token`. The handler is implemented in the
[`tokenHandler`](https://github.com/aricart/authdemo/blob/master/main.go#L93) function and it:

- Ensures (trivially) that the Google-issued JWT can be trusted
- Extracts the email for the authenticated user from the Google-issued JWT
- Generates a NATS user JWT:
    - It uses the [`nkey` library](https://github.com/nats-io/nkey) to generate an nkey for the user
    - It generates an identifier that is _safe_ for use in subjects that maps to the specific user
    - It generates a user JWT using the [`jwt` library](https://github.com/nats-io/jwt) which sets permissions on subjects
- Sends a number of cookies as a response to the user

> The JWT identifier and set permissions are the secret sauce. Some subjects are public, others are
scoped to the specific user. This allows the backend to understand who published the restricted messages. In effect
the backend can map a message back to a user.

Now the HTTP server has done it's part. We may have an authenticated user, and a number of cookies that the
client application on the browser can use to do its thing. Of particular interest, it has:

- The location of the NATS server
- The NATS user JWT
- The user's name
- And the prefix (safe subject it should use for publishing messages)
    
The client now does a client-side redirect to [`/app.html`](content_root/app.html), which loads [`app.js`](content_root/app.js) and 
ingests the specified HTTP cookies. From there the client application creates a NATS connection to the specified server, using 
the specified JWT for authentication, and does something cool with that.

## Additional Reading

While the above describes how the authentication is woven together, in the context of a web application,
it doesn't explain how the JWT authentication on NATS works, for that, please refer to the 
[NATS documentation on Decentralized JWT Authentication/Authorization](https://docs.nats.io/nats-server/configuration/securing_nats/jwt).


