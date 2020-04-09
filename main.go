package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/julienschmidt/httprouter"
	"github.com/nats-io/jwt"
	"github.com/nats-io/nkeys"
)

func abs(s string) string {
	t, err := filepath.Abs(s)
	if err != nil {
		log.Fatal(err)
	}
	return t
}

var contentDir string
var certFile string
var keyFile string
var gcreds string
var ssis map[string]string

func main() {
	ssis = make(map[string]string)

	flag.StringVar(&contentDir, "dir", "/srv/content_root", "set http content dir")
	flag.StringVar(&certFile, "cert", "/etc/letsencrypt/live/authdemo.nats-demo.info/fullchain.pem", "set tls cert file")
	flag.StringVar(&keyFile, "key", "/etc/letsencrypt/live/authdemo.nats-demo.info/privkey.pem", "set tls key file")
	flag.StringVar(&gcreds, "gcreds", "/srv/gcreds.json", "set tls key file")
	flag.Parse()

	contentDir = abs(contentDir)
	certFile = abs(certFile)
	keyFile = abs(keyFile)
	gcreds = abs(gcreds)

	d, err := ioutil.ReadFile(gcreds)
	if err != nil {
		log.Fatalf("error reading json configuration from %q: %v", gcreds, err)
	}
	if err := json.Unmarshal(d, &ssis); err != nil {
		log.Fatalf("error parsing json: %v", err)
	}
	for k, v := range ssis {
		log.Printf("appconf: \t%s=%v", k, v)
	}

	router := httprouter.New()
	router.Handle("POST", "/api/token", logPath(tokenHandler))
	router.Handle("GET", "/auth.html", logPath(authHandler))
	router.Handle("GET", "/app.js", logPath(appHandler))
	router.NotFound = http.FileServer(http.Dir(contentDir))

	log.Println("app started")
	log.Println("dir", contentDir)
	log.Println("cert", certFile)
	log.Println("key", keyFile)
	log.Println("gcreds", gcreds)

	log.Fatal(http.ListenAndServeTLS(":443", certFile, keyFile, router))
}

func logPath(next httprouter.Handle) httprouter.Handle {
	return func(w http.ResponseWriter, r *http.Request, p httprouter.Params) {
		log.Printf("[%s] %s - %s", r.Method, r.Host, r.URL.Path)
		next(w, r, p)
	}
}

func ssi(d []byte, m map[string]string) []byte {
	for k, v := range m {
		d = bytes.ReplaceAll(d, []byte(fmt.Sprintf("{{%s}}", k)), []byte(v))
	}
	return d
}

var auth []byte

func authHandler(w http.ResponseWriter, _ *http.Request, _ httprouter.Params) {
	if auth == nil {
		d, err := ioutil.ReadFile(filepath.Join(contentDir, "auth.html"))
		if err != nil {
			log.Fatalf("error reading index.html: %v", err)
		}
		auth = ssi(d, ssis)
	}
	w.Header().Add("Content-Type", "text/html")
	w.WriteHeader(200)
	w.Write(auth)
}

var app []byte

func appHandler(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	if app == nil {
		d, err := ioutil.ReadFile(filepath.Join(contentDir, "app.js"))
		if err != nil {
			log.Fatalf("unable to access /app.html: %v", err)
		}
		app = d
	}
	params := make(map[string]string)
	params["ws_server_url"] = ssis["ws_server_url"]
	cjwt, err := r.Cookie("cjwt")
	if err != nil {
		log.Printf("client doesn't have user jwt: %v", err)
		http.Redirect(w, r, "/auth.html", http.StatusOK)
		return
	}
	params["cjwt"] = cjwt.Value

	prefix, err := r.Cookie("prefix")
	if err != nil {
		log.Printf("client doesn't have user prefix: %v", err)
		http.Redirect(w, r, "/auth.html", http.StatusOK)
		return
	}
	params["prefix"] = prefix.Value

	v := ssi(app, params)
	w.Header().Add("Content-Type", "text/javascript")
	w.WriteHeader(200)
	w.Write(v)
}

func tokenHandler(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	log.Println("google auth token request received")
	if err := r.ParseForm(); err != nil {
		log.Printf("error parsing form: %v", err)
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	v := r.FormValue("token")

	// the jwt needs to be validated, to simplify the example
	// using the tokeninfo endpoint from google, which validates
	// the JWT and returns the JSON for it
	vr, err := http.Get("https://oauth2.googleapis.com/tokeninfo?id_token=" + v)
	if err != nil {
		log.Printf("error validating token: %v", err)
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	// read the decoded json
	d, err := ioutil.ReadAll(vr.Body)
	m := make(map[string]interface{})
	if err := json.Unmarshal(d, &m); err != nil {
		log.Printf("error loading json: %v", err)
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	// since we didn't do the diligence for decoding our own
	// jwt, let's verify at least the audience
	aud, ok := m["aud"].(string)
	if !ok || aud == "" {
		log.Printf("expected aud field in jwt")
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	if aud != ssis["client_id"] {
		log.Printf("unexpected jwt audience")
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	// if we are here we are good, now let's generate an user
	email, ok := m["email"].(string)
	if !ok || aud == "" {
		log.Printf("expected email field in the jwt to be a string")
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	user, err := createUserJwt(email)
	if err != nil {
		log.Printf("error generate user jwt: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	setCookie("cjwt", string(user), w)
	setCookie("prefix", fmt.Sprintf("user.%s", safeSubject(email)), w)
	w.WriteHeader(http.StatusOK)
	log.Printf("cookie set")
}

func setCookie(name string, value string, w http.ResponseWriter) {
	c := http.Cookie{
		Name:   name,
		Value:  value,
		MaxAge: 60 * 60,
		Path:   "/",
		Secure: true,
	}
	http.SetCookie(w, &c)
}

func createUserJwt(email string) ([]byte, error) {
	kp, err := nkeys.CreateUser()
	if err != nil {
		return nil, err
	}
	pk, err := kp.PublicKey()
	if err != nil {
		return nil, err
	}

	uc := jwt.NewUserClaims(pk)
	uc.Name = email
	uc.BearerToken = true
	subj := safeSubject(email)
	uc.Pub.Allow.Add("who")
	uc.Pub.Allow.Add(fmt.Sprintf("user.%s.>", subj))

	sk, err := nkeys.FromSeed([]byte(ssis["account_skey"]))
	token, err := uc.Encode(sk)
	if err != nil {
		return nil, err
	}
	return []byte(token), nil
}

func safeSubject(s string) string {
	s = strings.ReplaceAll(s, " ", "_")
	s = strings.ReplaceAll(s, ".", "_")
	return s
}
