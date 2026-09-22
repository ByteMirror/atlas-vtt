import json
import threading
import unittest
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from unittest.mock import Mock
from server import Handler, Server

class HttpReports(unittest.TestCase):
    def setUp(self):
        self.server = Server(("127.0.0.1", 0), Handler)
        self.server.reporter = Mock()
        self.server.reporter.submit.return_value = dict(number=42, url="https://github.com/ByteMirror/atlas-vtt/issues/42")
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def post(self, body, **headers):
        return urlopen(Request(self.url + "/atlas/reports", data=body, method="POST",
                              headers={"Content-Type": "application/json", **headers}))

    def test_submits_and_returns_receipt(self):
        with self.post(json.dumps(dict(requestId="id", report={})).encode(), **{"X-Forwarded-For": "1.1.1.1, 192.0.2.1"}) as response:
            self.assertEqual(response.status, 201)
            self.assertEqual(json.load(response)["number"], 42)
        self.server.reporter.submit.assert_called_once_with("id", {}, "192.0.2.1")

    def test_rejects_no_proxy_address_and_invalid_json(self):
        for body, headers in [(b"{}", {}), (b"invalid", {"X-Forwarded-For": "192.0.2.1"})]:
            with self.assertRaises(HTTPError) as error:
                self.post(body, **headers)
            self.assertEqual(error.exception.code, 400)
            error.exception.close()
        self.server.reporter.submit.assert_not_called()

    def test_rejects_large_request(self):
        with self.assertRaises(HTTPError) as error:
            self.post(b"x"*180001)
        self.assertEqual(error.exception.code, 413)
        error.exception.close()

if __name__ == "__main__":
    unittest.main()
