package main

import (
	"flag"
	"fmt"
	"github.com/mitchellh/go-homedir"
	"github.com/nats-io/nats.go"
	"github.com/nats-io/nuid"
	"log"
	"math/rand"
)

func main() {
	var count int
	flag.IntVar(&count, "count", 1, "count <count> pokenats")
	flag.Parse()

	creds, _ := homedir.Expand("~/.nkeys/creds/authdemo/authdemo/admin.creds")

	nc, err := nats.Connect("nats://authdemo.nats-demo.info",
		nats.NoEcho(),
		nats.UserCredentials(creds))
	if err != nil {
		log.Fatal(err)
	}

	imgs := []string{"N.png", "A.png", "T.png", "S.png"}
	for i := 0; i < count; i++ {
		idx := rand.Intn(4)
		id := fmt.Sprintf("pokenats_%s", nuid.Next())
		payload := fmt.Sprintf(`{ "name": "%s", "id": "%s", "avatar": "https://authdemo.nats-demo.info/assets/%s"}`, id, id, imgs[idx])
		sub := fmt.Sprintf("user.%s.entered", id)
		fmt.Println(sub, payload)
		if err := nc.Publish(sub, []byte(payload)); err != nil {
			log.Fatal(err)
		}
	}
	nc.Flush()
	nc.Close()
}
