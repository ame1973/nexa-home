// Package contract embeds and validates the normative OpenAPI 3.1 contract.
package contract

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/santhosh-tekuri/jsonschema/v6"
)

//go:embed openapi.json
var document []byte

type Operation struct {
	Method string
	Path   string
}

type Contract struct {
	requests   map[string]*jsonschema.Schema
	responses  map[string]map[int]*jsonschema.Schema
	operations []Operation
}

type localOnlyLoader struct{}

func (localOnlyLoader) Load(string) (any, error) {
	return nil, errors.New("external schema references are disabled")
}

func New() (*Contract, error) {
	var root map[string]any
	if err := json.Unmarshal(document, &root); err != nil {
		return nil, err
	}
	compiler := jsonschema.NewCompiler()
	compiler.DefaultDraft(jsonschema.Draft2020)
	compiler.AssertFormat()
	compiler.UseLoader(localOnlyLoader{})
	const resource = "https://nexa.invalid/openapi.json"
	if err := compiler.AddResource(resource, root); err != nil {
		return nil, err
	}
	c := &Contract{requests: make(map[string]*jsonschema.Schema), responses: make(map[string]map[int]*jsonschema.Schema)}
	for path, methods := range root["paths"].(map[string]any) {
		for method, value := range methods.(map[string]any) {
			op := value.(map[string]any)
			key := strings.ToUpper(method) + " " + path
			c.operations = append(c.operations, Operation{strings.ToUpper(method), path})
			pointer := resource + "#/paths/" + escapePointer(path) + "/" + method
			if body, ok := op["requestBody"].(map[string]any); ok {
				if _, ok := body["content"].(map[string]any)["application/json"]; ok {
					schema, err := compiler.Compile(pointer + "/requestBody/content/application~1json/schema")
					if err != nil {
						return nil, fmt.Errorf("compile %s request: %w", key, err)
					}
					c.requests[key] = schema
				}
			}
			c.responses[key] = make(map[int]*jsonschema.Schema)
			for status, value := range op["responses"].(map[string]any) {
				code, err := strconv.Atoi(status)
				if err != nil {
					return nil, err
				}
				c.responses[key][code] = nil
				content, ok := value.(map[string]any)["content"].(map[string]any)
				if !ok || content["application/json"] == nil {
					continue
				}
				schema, err := compiler.Compile(pointer + "/responses/" + status + "/content/application~1json/schema")
				if err != nil {
					return nil, fmt.Errorf("compile %s response: %w", key, err)
				}
				c.responses[key][code] = schema
			}
		}
	}
	return c, nil
}

func escapePointer(value string) string {
	return strings.ReplaceAll(strings.ReplaceAll(value, "~", "~0"), "/", "~1")
}

func (c *Contract) Operations() []Operation {
	return append([]Operation(nil), c.operations...)
}

// Decode rejects duplicate keys before schema validation can lose that evidence.
func (c *Contract) Decode(method, path string, body []byte, target any) error {
	schema := c.requests[method+" "+path]
	if schema == nil {
		return errors.New("no JSON request schema for operation")
	}
	value, err := StrictJSON(body)
	if err != nil {
		return err
	}
	if err := schema.Validate(value); err != nil {
		return err
	}
	return json.Unmarshal(body, target)
}

// ValidateResponse is used by integration tests against real handler output.
func (c *Contract) ValidateResponse(method, path string, status int, body []byte) error {
	schema, ok := c.responses[method+" "+path][status]
	if !ok {
		return fmt.Errorf("undocumented response: %s %s %d", method, path, status)
	}
	if schema == nil {
		if status == 204 && len(body) != 0 {
			return errors.New("204 response must be empty")
		}
		return nil
	}
	value, err := StrictJSON(body)
	if err != nil {
		return err
	}
	return schema.Validate(value)
}

// StrictJSON bounds nesting and rejects duplicate object keys at every depth.
func StrictJSON(data []byte) (any, error) {
	if !utf8.Valid(data) {
		return nil, errors.New("invalid UTF-8")
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	value, err := readValue(decoder, 0)
	if err != nil {
		return nil, err
	}
	if _, err := decoder.Token(); err != io.EOF {
		return nil, errors.New("expected one JSON value")
	}
	return value, nil
}

func readValue(decoder *json.Decoder, depth int) (any, error) {
	if depth > 64 {
		return nil, errors.New("JSON nesting exceeds 64 levels")
	}
	token, err := decoder.Token()
	if err != nil {
		return nil, err
	}
	delimiter, ok := token.(json.Delim)
	if !ok {
		return token, nil
	}
	switch delimiter {
	case '{':
		object := make(map[string]any)
		for decoder.More() {
			key, err := decoder.Token()
			if err != nil {
				return nil, err
			}
			name, ok := key.(string)
			if !ok {
				return nil, errors.New("expected object key")
			}
			if _, exists := object[name]; exists {
				return nil, errors.New("duplicate JSON key")
			}
			value, err := readValue(decoder, depth+1)
			if err != nil {
				return nil, err
			}
			object[name] = value
		}
		_, err := decoder.Token()
		return object, err
	case '[':
		array := make([]any, 0)
		for decoder.More() {
			value, err := readValue(decoder, depth+1)
			if err != nil {
				return nil, err
			}
			array = append(array, value)
		}
		_, err := decoder.Token()
		return array, err
	default:
		return nil, errors.New("unexpected JSON delimiter")
	}
}

// FieldErrors returns only locations, never submitted values or schema internals.
func FieldErrors(err error) map[string]string {
	fields := make(map[string]string)
	var validation *jsonschema.ValidationError
	if errors.As(err, &validation) {
		var visit func(*jsonschema.ValidationError)
		visit = func(e *jsonschema.ValidationError) {
			if len(e.Causes) == 0 {
				path := strings.Join(e.InstanceLocation, ".")
				if path == "" {
					path = "body"
				}
				fields[path] = "Invalid or missing value"
			}
			for _, cause := range e.Causes {
				visit(cause)
			}
		}
		visit(validation)
	} else {
		fields["body"] = "Expected valid JSON matching the request schema"
	}
	return fields
}
