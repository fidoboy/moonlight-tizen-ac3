#include <libxml/parser.h>
#include <libxml/xpath.h>
#include <libxml/c14n.h>
#include <stdio.h>
#include <string.h>

int main(int argc, char **argv) {
    if (argc != 4) {
        fprintf(stderr, "usage: xml-c14n <xml-file> <xpath> <mode>\n");
        return 2;
    }

    int mode;
    if (strcmp(argv[3], "exclusive") == 0) {
        mode = XML_C14N_EXCLUSIVE_1_0;
    } else if (strcmp(argv[3], "c14n11") == 0) {
        mode = XML_C14N_1_1;
    } else {
        fprintf(stderr, "unsupported canonicalization mode: %s\n", argv[3]);
        return 2;
    }

    xmlInitParser();
    xmlDocPtr doc = xmlReadFile(
        argv[1], NULL, XML_PARSE_NONET | XML_PARSE_NOERROR | XML_PARSE_NOWARNING
    );
    if (doc == NULL) {
        fprintf(stderr, "could not parse XML document: %s\n", argv[1]);
        return 3;
    }

    xmlXPathContextPtr context = xmlXPathNewContext(doc);
    xmlXPathObjectPtr selected = context == NULL ? NULL :
        xmlXPathEvalExpression((const xmlChar *)argv[2], context);
    if (selected == NULL || selected->type != XPATH_NODESET ||
        selected->nodesetval == NULL) {
        fprintf(stderr, "XPath did not select an XML node set\n");
        if (selected != NULL) xmlXPathFreeObject(selected);
        if (context != NULL) xmlXPathFreeContext(context);
        xmlFreeDoc(doc);
        return 4;
    }

    xmlChar *canonical = NULL;
    int length = xmlC14NDocDumpMemory(
        doc, selected->nodesetval, mode, NULL, 0, &canonical
    );
    if (length < 0 || canonical == NULL) {
        fprintf(stderr, "XML canonicalization failed\n");
        if (canonical != NULL) xmlFree(canonical);
        xmlXPathFreeObject(selected);
        xmlXPathFreeContext(context);
        xmlFreeDoc(doc);
        return 5;
    }

    int result = fwrite(canonical, 1, (size_t)length, stdout) == (size_t)length
        ? 0 : 6;
    xmlFree(canonical);
    xmlXPathFreeObject(selected);
    xmlXPathFreeContext(context);
    xmlFreeDoc(doc);
    xmlCleanupParser();
    return result;
}
