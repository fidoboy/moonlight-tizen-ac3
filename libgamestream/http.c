/*
 * This file is part of Moonlight Embedded.
 *
 * Copyright (C) 2015 Iwan Timmer
 *
 * Moonlight is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 3 of the License, or
 * (at your option) any later version.
 *
 * Moonlight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Moonlight; if not, see <http://www.gnu.org/licenses/>.
 */

#include "http.h"
#include "errors.h"

#include <string.h>
#include <stdio.h>
#include <curl/curl.h>

#include <openssl/ssl.h>
#include <openssl/x509v3.h>
#include <openssl/pem.h>

extern X509 *g_Cert;
extern EVP_PKEY *g_PrivateKey;

static size_t _write_curl(void *contents, size_t size, size_t nmemb, void *userp)
{
  size_t realsize = size * nmemb;
  PHTTP_DATA mem = (PHTTP_DATA)userp;
 
  mem->memory = realloc(mem->memory, mem->size + realsize + 1);
  if(mem->memory == NULL)
    return 0;
 
  memcpy(&(mem->memory[mem->size]), contents, realsize);
  mem->size += realsize;
  mem->memory[mem->size] = 0;
 
  return realsize;
}

static CURLcode sslctx_function(CURL * curl, void * sslctx, void * parm)
{
    SSL_CTX* ctx = (SSL_CTX*)sslctx;
    
    if(!SSL_CTX_use_certificate(ctx, g_Cert))
        printf("SSL_CTX_use_certificate problem\n");
    
    if(!SSL_CTX_use_PrivateKey(ctx, g_PrivateKey))
        printf("Use Key failed\n");
    
    return CURLE_OK;
}

volatile int g_CancelHttpRequest = 0;
static CURL *g_NetworkTestCurlWithTlsCache = NULL;
static CURL *g_NetworkTestCurlWithoutTlsCache = NULL;
static struct curl_slist *g_NetworkTestResolveListWithTlsCache = NULL;
static struct curl_slist *g_NetworkTestResolveListWithoutTlsCache = NULL;
static char g_NetworkTestCurlErrorBufferWithTlsCache[CURL_ERROR_SIZE];
static char g_NetworkTestCurlErrorBufferWithoutTlsCache[CURL_ERROR_SIZE];
static unsigned long g_NetworkTestRequestCountWithTlsCache = 0;
static unsigned long g_NetworkTestRequestCountWithoutTlsCache = 0;

void http_cancel_request() {
  g_CancelHttpRequest = 1;
}

void http_reset_cancel() {
  g_CancelHttpRequest = 0;
}

static int _progress_callback(void *clientp, double dltotal, double dlnow, double ultotal, double ulnow) {
  if (g_CancelHttpRequest) {
    return 1;
  }
  return 0;
}

static int http_request_internal(const char* url, const char* ppkstr, PHTTP_DATA data, CURL **persistent_curl, int ssl_session_cache) {
  int ret;
  CURL *curl;
  const char* real_url = url;
  char* rewritten_url = NULL;
  char* resolve_string = NULL;
  struct curl_slist *resolve_list = NULL;
  char local_curl_error_buffer[CURL_ERROR_SIZE] = {0};
  char *curl_error_buffer = persistent_curl == &g_NetworkTestCurlWithTlsCache
    ? g_NetworkTestCurlErrorBufferWithTlsCache
    : (persistent_curl == &g_NetworkTestCurlWithoutTlsCache
      ? g_NetworkTestCurlErrorBufferWithoutTlsCache : local_curl_error_buffer);
  struct curl_slist **persistent_resolve_list = persistent_curl == &g_NetworkTestCurlWithTlsCache
    ? &g_NetworkTestResolveListWithTlsCache
    : (persistent_curl == &g_NetworkTestCurlWithoutTlsCache
      ? &g_NetworkTestResolveListWithoutTlsCache : NULL);
  memset(curl_error_buffer, 0, CURL_ERROR_SIZE);

  http_reset_cancel();

  curl = persistent_curl ? *persistent_curl : NULL;
  if (curl == NULL) {
    curl = curl_easy_init();
    if (curl == NULL) return GS_FAILED;
    if (persistent_curl) *persistent_curl = curl;
  }

  curl_easy_setopt(curl, CURLOPT_ERRORBUFFER, curl_error_buffer);
  curl_easy_setopt(curl, CURLOPT_CAINFO, "/curl/ca-bundle.crt");
  curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, _write_curl);
  curl_easy_setopt(curl, CURLOPT_FAILONERROR, 1L);
  curl_easy_setopt(curl, CURLOPT_NOPROGRESS, 0L);
  curl_easy_setopt(curl, CURLOPT_PROGRESSFUNCTION, _progress_callback);
  curl_easy_setopt(curl, CURLOPT_SSL_CTX_FUNCTION, *sslctx_function);
  curl_easy_setopt(curl, CURLOPT_SSL_SESSIONID_CACHE, persistent_curl != NULL && ssl_session_cache ? 1L : 0L);
  if (persistent_curl == NULL) {
    curl_easy_setopt(curl, CURLOPT_MAXCONNECTS, 0L);
    curl_easy_setopt(curl, CURLOPT_FRESH_CONNECT, 1L);
    curl_easy_setopt(curl, CURLOPT_FORBID_REUSE, 1L);
  }
  curl_easy_setopt(curl, CURLOPT_CONNECTTIMEOUT, 3L);
  curl_easy_setopt(curl, CURLOPT_NOSIGNAL, 1L);
  curl_easy_setopt(curl, CURLOPT_SSL_ENABLE_ALPN, 0L);
  curl_easy_setopt(curl, CURLOPT_WRITEDATA, data);

  const char* bracket_start = strchr(url, '[');
  const char* bracket_end = strchr(url, ']');

  if (bracket_start != NULL && bracket_end != NULL && bracket_end > bracket_start) {
    int ipv6_len = bracket_end - bracket_start - 1;
    char ipv6_raw[128] = {0};
    if (ipv6_len < sizeof(ipv6_raw)) {
      strncpy(ipv6_raw, bracket_start + 1, ipv6_len);
    }
    
    const char* port_and_path = bracket_end + 1;
    
    int scheme_len = bracket_start - url;
    char scheme[32] = {0};
    if (scheme_len < sizeof(scheme)) {
      strncpy(scheme, url, scheme_len);
    }

    int port = 80;
    if (port_and_path[0] == ':') {
      port = atoi(port_and_path + 1);
    } else if (strncmp(scheme, "https://", 8) == 0) {
      port = 443;
    }

    const char* dummy_host = "moonlight-ipv6-host";
    rewritten_url = malloc(strlen(url) + strlen(dummy_host) + 1);
    sprintf(rewritten_url, "%s%s%s", scheme, dummy_host, port_and_path);

    resolve_string = malloc(strlen(dummy_host) + strlen(ipv6_raw) + 32);
    sprintf(resolve_string, "%s:%d:%s", dummy_host, port, ipv6_raw);

    resolve_list = curl_slist_append(NULL, resolve_string);
    if (resolve_list == NULL) {
      ret = GS_OUT_OF_MEMORY;
      goto cleanup;
    }
    real_url = rewritten_url;
  }

  if (persistent_curl != NULL) {
    // CURLOPT_RESOLVE retains the supplied list. Keep it alive for as long as
    // the persistent easy handle can reference it, replacing the previous list
    // only after libcurl has accepted the new one.
    struct curl_slist *previous_resolve_list = persistent_resolve_list != NULL ? *persistent_resolve_list : NULL;
    CURLcode resolve_result = curl_easy_setopt(curl, CURLOPT_RESOLVE, resolve_list);
    if (resolve_result != CURLE_OK) {
      ret = GS_FAILED;
      goto cleanup;
    }
    if (persistent_resolve_list != NULL) *persistent_resolve_list = resolve_list;
    resolve_list = NULL;
    if (previous_resolve_list != NULL) {
      curl_slist_free_all(previous_resolve_list);
    }
  } else {
    curl_easy_setopt(curl, CURLOPT_RESOLVE, resolve_list);
  }
  curl_easy_setopt(curl, CURLOPT_URL, real_url);

  // Use the pinned certificate for HTTPS
  if (ppkstr != NULL) {
    curl_easy_setopt(curl, CURLOPT_SSL_VERIFYHOST, 0L);
    curl_easy_setopt(curl, CURLOPT_SSL_VERIFYPEER, 0L);
    curl_easy_setopt(curl, CURLOPT_PINNEDPUBLICKEY, ppkstr);
  }

  if (data->size > 0) {
    free(data->memory);
    data->memory = malloc(1);
    if(data->memory == NULL) {
      ret = GS_OUT_OF_MEMORY;
      goto cleanup;
    }

    data->size = 0;
  }

  CURLcode res = curl_easy_perform(curl);

  // Record connection and TLS timing separately for each persistent test context.
  if (persistent_curl != NULL) {
    long new_connections = -1;
    double connect_time = 0.0;
    double appconnect_time = 0.0;
    unsigned long request_number = ssl_session_cache
      ? ++g_NetworkTestRequestCountWithTlsCache
      : ++g_NetworkTestRequestCountWithoutTlsCache;
    CURLcode info_connections = curl_easy_getinfo(curl, CURLINFO_NUM_CONNECTS, &new_connections);
    CURLcode info_connect = curl_easy_getinfo(curl, CURLINFO_CONNECT_TIME, &connect_time);
    CURLcode info_appconnect = curl_easy_getinfo(curl, CURLINFO_APPCONNECT_TIME, &appconnect_time);

    fprintf(stderr,
      "[network-test-http] curl_handle=shared tls_cache=%s request=%lu new_connections=%ld connect_ms=%.1f tls_handshake_ms=%.1f info=%d/%d/%d curl=%d\n",
      ssl_session_cache ? "on" : "off", request_number,
      info_connections == CURLE_OK ? new_connections : -1L,
      info_connect == CURLE_OK ? connect_time * 1000.0 : -1.0,
      info_appconnect == CURLE_OK ? appconnect_time * 1000.0 : -1.0,
      (int)info_connections, (int)info_connect, (int)info_appconnect, (int)res);
  }

  // Do not print request URLs or public-key pins to runtime logs.
  
  if (res == CURLE_SSL_PINNEDPUBKEYNOTMATCH) {
    ret = GS_CERT_MISMATCH;
  } else if (res != CURLE_OK) {
    if (persistent_curl != NULL) {
      fprintf(stderr, "[network-test-http] libcurl error %d (%s): %s\n",
        (int)res, curl_easy_strerror(res), curl_error_buffer[0] ? curl_error_buffer : "no additional details");
    }
    ret = GS_FAILED;
  } else if (data->memory == NULL) {
    ret = GS_OUT_OF_MEMORY;
  } else {
    ret = GS_OK;
  }
  
cleanup:
  if (rewritten_url) free(rewritten_url);
  if (resolve_string) free(resolve_string);
  if (resolve_list) curl_slist_free_all(resolve_list);
  if (persistent_curl != NULL) {
    // Do not leave the persistent handle pointing at request-scoped memory.
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, NULL);
    curl_easy_setopt(curl, CURLOPT_ERRORBUFFER, NULL);
  } else {
    curl_easy_cleanup(curl);
  }
  return ret;
}

int http_request(const char* url, const char* ppkstr, PHTTP_DATA data) {
  return http_request_internal(url, ppkstr, data, NULL, 0);
}

int http_request_network_test(const char* url, const char* ppkstr, PHTTP_DATA data, int ssl_session_cache) {
  CURL **curl = ssl_session_cache ? &g_NetworkTestCurlWithTlsCache : &g_NetworkTestCurlWithoutTlsCache;
  return http_request_internal(url, ppkstr, data, curl, ssl_session_cache);
}

void http_close_network_test_session(void) {
  if (g_NetworkTestCurlWithTlsCache != NULL) {
    curl_easy_setopt(g_NetworkTestCurlWithTlsCache, CURLOPT_RESOLVE, NULL);
    curl_easy_cleanup(g_NetworkTestCurlWithTlsCache);
    g_NetworkTestCurlWithTlsCache = NULL;
  }
  if (g_NetworkTestCurlWithoutTlsCache != NULL) {
    curl_easy_setopt(g_NetworkTestCurlWithoutTlsCache, CURLOPT_RESOLVE, NULL);
    curl_easy_cleanup(g_NetworkTestCurlWithoutTlsCache);
    g_NetworkTestCurlWithoutTlsCache = NULL;
  }
  if (g_NetworkTestResolveListWithTlsCache != NULL) {
    curl_slist_free_all(g_NetworkTestResolveListWithTlsCache);
    g_NetworkTestResolveListWithTlsCache = NULL;
  }
  if (g_NetworkTestResolveListWithoutTlsCache != NULL) {
    curl_slist_free_all(g_NetworkTestResolveListWithoutTlsCache);
    g_NetworkTestResolveListWithoutTlsCache = NULL;
  }
  g_NetworkTestRequestCountWithTlsCache = 0;
  g_NetworkTestRequestCountWithoutTlsCache = 0;
}

PHTTP_DATA http_create_data() {
  PHTTP_DATA data = malloc(sizeof(HTTP_DATA));
  if (data == NULL)
    return NULL;

  data->memory = malloc(1);
  if(data->memory == NULL) {
    free(data);
    return NULL;
  }
  data->size = 0;

  return data;
}

void http_free_data(PHTTP_DATA data) {
  if (data != NULL) {
    if (data->memory != NULL)
      free(data->memory);

    free(data);
  }
}
