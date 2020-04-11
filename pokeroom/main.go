package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"github.com/nats-io/nats.go"
	"github.com/nats-io/nuid"
	"log"
	"math/rand"
	"runtime"
	"strings"
	"sync"
	"time"
)

type PokeRoom struct {
	sync.Mutex
	nc     *nats.Conn
	max    int
	fake   map[string]string
	real   map[string]string
	creds  string
	server string
}

func (r *PokeRoom) init() {
	r.fake = make(map[string]string)
	r.real = make(map[string]string)
	r.newPoke(r.max)
}

func (r *PokeRoom) Run() error {
	r.init()
	c, err := nats.Connect(r.server,
		nats.NoEcho(),
		nats.UserCredentials(r.creds))
	if err != nil {
		return err
	}
	fmt.Println("connected to NATS filling up room with", r.max, "pokenats")
	r.nc = c

	_, err = r.nc.Subscribe("user.*.entered", r.AddVisitor)
	if err != nil {
		log.Fatal(err)
	}

	_, err = r.nc.Subscribe("user.*.exited", r.RemoveVisitor)
	if err != nil {
		log.Fatal(err)
	}

	inbox := r.nc.NewRespInbox()
	ws, err := r.nc.Subscribe(inbox, r.AddVisitor)
	if err != nil {
		log.Fatal(err)
	}

	if err := r.nc.PublishRequest("user.who", inbox, nil); err != nil {
		log.Fatal(err)
	}
	time.Sleep(time.Second * 5)
	if err := ws.Drain(); err != nil {
		log.Fatal(err)
	}

	r.nc.Subscribe("user.who", r.WhoHandler)
	return nil
}

func (r *PokeRoom) newPoke(c int) {
	for i := 0; i < c; i++ {
		imgs := []string{"N.png", "A.png", "T.png", "S.png"}
		idx := rand.Intn(4)
		id := fmt.Sprintf("pokenats_%s", nuid.Next())
		img := fmt.Sprintf("https://authdemo.nats-demo.info/assets/%s", imgs[idx])
		r.fake[id] = img
		if r.nc != nil {
			payload := []byte(fmt.Sprintf(`{ "name": "%s", "id": "%s", "avatar": "%s"}`, id, id, img))
			subj := fmt.Sprintf("user.%s.entered", id)
			r.nc.Publish(subj, payload)
		}
	}
}

func (r *PokeRoom) AddVisitor(m *nats.Msg) {
	r.Lock()
	defer r.Unlock()
	e := make(map[string]string)
	if err := json.Unmarshal(m.Data, &e); err != nil {
		log.Fatal(err)
	}
	if !strings.HasPrefix(e["id"], "pokenats_") {
		r.real[e["id"]] = e["avatar"]
	}
	r.checkCapacity()
}

func (r *PokeRoom) RemoveVisitor(m *nats.Msg) {
	r.Lock()
	defer r.Unlock()
	tokens := strings.Split(m.Subject, ".")
	if strings.HasPrefix(tokens[1], "pokenats_") {
		delete(r.fake, tokens[1])
	} else {
		delete(r.real, tokens[1])
	}

	r.checkCapacity()
}

func (r *PokeRoom) evict(c int) {
	keys := make([]string, 0, c)
	for k := range r.fake {
		keys = append(keys, k)
		if len(keys) == c {
			break
		}
	}
	for _, v := range keys {
		delete(r.fake, v)
		subj := fmt.Sprintf("user.%s.exited", v)
		jp, _ := json.Marshal(nil)
		r.nc.Publish(subj, jp)
	}
}

func (r *PokeRoom) checkCapacity() {
	rlen := len(r.real)
	flen := len(r.fake)
	need := r.max - (rlen + flen)
	if need == 0 {
		return
	} else if need > 0 {
		r.newPoke(need)
	} else {
		need = -need
		r.evict(need)
	}
}

func (r *PokeRoom) WhoHandler(m *nats.Msg) {
	r.Lock()
	defer r.Unlock()
	r.checkCapacity()
	for k, v := range r.fake {
		payload := []byte(fmt.Sprintf(`{ "name": "%s", "id": "%s", "avatar": "%s"}`, k, k, v))
		m.Respond(payload)
	}
}

func main() {
	r := &PokeRoom{}
	flag.StringVar(&r.creds, "creds", "/srv/admin.creds", "creds file path")
	flag.StringVar(&r.server, "server", "nats://authdemo.nats-demo.info", "server url")
	flag.IntVar(&r.max, "count", 0, "count <count> pokenats")
	flag.Parse()
	r.Run()
	runtime.Goexit()
}
