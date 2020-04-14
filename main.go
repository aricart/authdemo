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

func main() {
	s := NewAuthServer()
	flag.StringVar(&s.contentDir, "dir", "/srv/content_root", "set http content dir")
	flag.StringVar(&s.certFile, "cert", "/etc/letsencrypt/live/authdemo.nats-demo.info/fullchain.pem", "set tls cert file")
	flag.StringVar(&s.keyFile, "key", "/etc/letsencrypt/live/authdemo.nats-demo.info/privkey.pem", "set tls key file")
	flag.StringVar(&s.gcreds, "gcreds", "/srv/gcreds.json", "set tls key file")
	flag.Parse()

	s.Run()
}

type AuthServer struct {
	contentDir string
	certFile   string
	keyFile    string
	gcreds     string
	ssis       map[string]string
	authPage   []byte
	jsApp      []byte
}

func NewAuthServer() *AuthServer {
	var s AuthServer
	s.ssis = make(map[string]string)
	return &s
}

// Run preloads some of the assets and processes server side includes
// sets up a router, and starts a tls server
func (s *AuthServer) Run() {
	if err := s.init(); err != nil {
		log.Fatal(err)
	}
	router := httprouter.New()
	router.Handle("POST", "/api/token", logPath(s.tokenHandler))
	router.NotFound = http.FileServer(http.Dir(s.contentDir))

	log.Println("app started")
	log.Println("dir", s.contentDir)
	log.Println("cert", s.certFile)
	log.Println("key", s.keyFile)
	log.Println("gcreds", s.gcreds)

	go func() {
		if err := http.ListenAndServe(":80", http.HandlerFunc(redirectHttp)); err != nil {
			log.Fatalf("error listening for http: %v", err)
		}
	}()
	log.Fatal(http.ListenAndServeTLS(":443", s.certFile, s.keyFile, router))
}

func redirectHttp(w http.ResponseWriter, r *http.Request) {
	http.Redirect(w, r, fmt.Sprintf("https://authdemo.nats-demo.info%s", r.RequestURI), http.StatusMovedPermanently)
}

// logPath is a middle ware that performs some logging of requested http routes
func logPath(next httprouter.Handle) httprouter.Handle {
	return func(w http.ResponseWriter, r *http.Request, p httprouter.Params) {
		log.Printf("[%s] %s - %s", r.Method, r.Host, r.URL.Path)
		next(w, r, p)
	}
}

// ssi performs replacements of '{{key}}' with values provided in a map
func ssi(d []byte, m map[string]string) []byte {
	for k, v := range m {
		d = bytes.ReplaceAll(d, []byte(fmt.Sprintf("{{%s}}", k)), []byte(v))
	}
	return d
}

// tokenHandler pseudo validates the google authentication token provided by the client
// and generates a user JWT. The user JWT as well as the prefix the client has to use
// to publish is set as a cookie on the client
func (s *AuthServer) tokenHandler(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	email, err := s.validateGoogleUserToken(r)
	if err != nil {
		log.Printf("error validating google user token: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	user, err := s.createUserJwt(email)
	if err != nil {
		log.Printf("error generating user jwt: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	setCookie("cjwt", string(user), w)
	setCookie("prefix", fmt.Sprintf("user.%s", safeSubject(email)), w)
	setCookie("ws_server_url", s.ssis["ws_server_url"], w)
	setCookie("user_name", email, w)
	w.WriteHeader(http.StatusOK)
	log.Printf("%s authenticated", email)
}

func (s *AuthServer) validateGoogleUserToken(r *http.Request) (string, error) {
	log.Println("google auth token request received")
	if err := r.ParseForm(); err != nil {
		return "", fmt.Errorf("error parsing form: %v", err)
	}
	v := r.FormValue("token")
	// the jwt needs to be validated, to simplify the example
	// using the tokeninfo endpoint from google, which validates
	// the JWT and returns the JSON for it
	vr, err := http.Get("https://oauth2.googleapis.com/tokeninfo?id_token=" + v)
	if err != nil {
		return "", fmt.Errorf("error validating token: %v", err)
	}
	// read the decoded json
	d, err := ioutil.ReadAll(vr.Body)
	m := make(map[string]interface{})
	if err := json.Unmarshal(d, &m); err != nil {
		return "", fmt.Errorf("error loading json: %v", err)
	}
	// since we didn't do the diligence for decoding our own
	// jwt, let's verify at least the audience
	aud, ok := m["aud"].(string)
	if !ok || aud == "" {
		return "", fmt.Errorf("expected aud field in jwt")
	}
	if aud != s.ssis["client_id"] {
		return "", fmt.Errorf("unexpected jwt audience")
	}
	// if we are here we are good, now let's generate an user
	email, ok := m["email"].(string)
	if !ok || aud == "" {
		return "", fmt.Errorf("expected email field in the jwt to be a string")
	}
	return email, nil
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

func (s *AuthServer) createUserJwt(email string) ([]byte, error) {
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
	uc.Pub.Allow.Add("user.who")
	uc.Sub.Allow.Add("user.who")

	uc.Pub.Allow.Add("_inbox.user.*")
	uc.Sub.Allow.Add("_inbox.user.*")

	uc.Pub.Allow.Add(fmt.Sprintf("user.%s.*", subj))
	uc.Sub.Allow.Add("user.*.*")

	uc.IssuerAccount = s.ssis["account_id"]

	sk, err := nkeys.FromSeed([]byte(s.ssis["account_skey"]))
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

func (s *AuthServer) init() error {
	s.abs()
	d, err := ioutil.ReadFile(s.gcreds)
	if err != nil {
		log.Fatalf("error reading json configuration from %q: %v", s.gcreds, err)
	}
	if err := json.Unmarshal(d, &s.ssis); err != nil {
		log.Fatalf("error parsing json: %v", err)
	}
	for k, v := range s.ssis {
		log.Printf("appconf: \t%s=%v", k, v)
	}
	return nil
}

func (s *AuthServer) abs() error {
	var err error
	if s.contentDir, err = filepath.Abs(s.contentDir); err != nil {
		return err
	}
	if s.certFile, err = filepath.Abs(s.certFile); err != nil {
		return err
	}
	if s.keyFile, err = filepath.Abs(s.keyFile); err != nil {
		return err
	}
	if s.gcreds, err = filepath.Abs(s.gcreds); err != nil {
		return err
	}
	return nil
}
