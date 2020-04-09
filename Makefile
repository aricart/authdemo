CWD:=$(shell echo `pwd`)
BUILD_DIR:=$(CWD)/build
CONTENT_DIR:=$(CWD)/content_root
BUILD_OS:=$(shell go env GOOS)
BUILD_OS_ARCH:=$(shell go env GOARCH)
BUILD_OS_GOPATH:=$(shell go env GOPATH)

.PHONY: build test release

build: compile

fmt:
	gofmt -s -w *.go
	goimports -w *.go
	go mod tidy

compile:
	goreleaser --snapshot --rm-dist --skip-validate --skip-publish --parallelism 12

install: compile build
	cp $(BUILD_DIR)/goath_$(BUILD_OS)_$(BUILD_OS_ARCH)/* $(BUILD_OS_GOPATH)/bin

cover: test
	go tool cover -html=./coverage.out

test:
	go mod vendor
	go vet ./...
	rm -rf ./coverage.out
	go test -coverpkg=./... -coverprofile=./coverage.out ./...

release: fmt test compile

update-all: update-server update-assets

update-server: compile
	scp $(BUILD_DIR)/authdemo_linux_amd64/* root@authdemo.nats-demo.info:/usr/local/bin

update-assets:
	scp -r $(CONTENT_DIR)/* root@authdemo.nats-demo.info:/srv/content_root
	scp $(CWD)/server.conf root@authdemo.nats-demo.info:/srv/
	scp $(CWD)/gcreds.json root@authdemo.nats-demo.info:/srv/
