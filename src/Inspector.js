var completionType = require('./completion-type');
var scopeType = require('./scope-type');

var tagShorthandRegExp = /([a-zA-Z0-9_-]+)[#.][a-zA-Z0-9_#.:-]+/;

var prefixRegExp = /[A-Za-z0-9_\-\.\#]+$/;

var tagNameCharsRegExp = /[a-zA-Z0-9_#.:-]/;

var tagNameRegExp = /[a-zA-Z0-9.\-:#]+$/;

var endingTagRegExp = /<\/([a-zA-Z0-9.\-:#]+)?$/;

var endingTagBracketRegExp = /^\s*>/;

var attrNameCharsRegExp = /[a-zA-Z0-9_#.:-]/;

var attrNameRegExp = /[a-zA-Z0-9.\-:]+$/;

var attrCompletionRegExp = /([a-zA-Z0-9.\-:]+)(=["'][A-Za-z0-9_\-\.\#]*)?$/;
var tagCompletionRegExp = /([a-zA-Z0-9.\-:#]+)$/;

var scopesLookup = {
    // Attribute name:
    'entity.other.attribute-name.html': { type: scopeType.ATTR_NAME },
    'support.function.marko-attribute': { type: scopeType.ATTR_NAME },

    'punctuation.separator.key-value.html': { type: scopeType.ATTR_NAME_VALUE_SEPARATOR },

    'punctuation.definition.string.end.js': { type: scopeType.STRING },
    'string.quoted.double.js': { type: scopeType.STRING },
    'string.quoted.single.js': { type: scopeType.STRING },

    // Tags:
    'entity.name.tag': { type: scopeType.TAG },
    'entity.name.tag.html': { type: scopeType.TAG },
    'entity.name.tag.concise': { type: scopeType.TAG, concise: true  },
    'support.function.marko-tag': { type: scopeType.TAG },
    'support.function.marko-tag.html': { type: scopeType.TAG },
    'support.function.marko-tag.concise': { type: scopeType.TAG, concise: true  },
    'support.function.marko-tag.html.html': { type: scopeType.TAG },
    'support.function.marko-tag.html.shorthand': { type: scopeType.TAG },
    'meta.tag.any.html': { type: scopeType.TAG },
    'meta.tag.other.html': { type: scopeType.TAG },
    'meta.tag.block.any.html': { type: scopeType.TAG },
    'meta.tag.inline.any.html': { type: scopeType.TAG },
    'meta.tag.structure.any.html': { type: scopeType.TAG }
};


function checkEndingTag() {

}
class Inspector {
    constructor(request) {
        var editor = request.editor;
        this.editor = editor;

        var bufferPosition = request.bufferPosition;
        var line = this.lineUpToPos(bufferPosition);
        var scopeDescriptor = request.scopeDescriptor;



        this.pos = bufferPosition;
        this.line = line;
        this.scopeDescriptor = scopeDescriptor;
    }

    inspect() {
        var pos = this.pos;

        let inspected = this.getTagAndAttributeNameFromPos(pos) || {};

        let attrName = inspected.attributeName;
        let tagName = inspected.tagName;
        let line = this.lineUpToPos(pos);
        let prefixMatches = prefixRegExp.exec(line);
        let prefix = prefixMatches ? prefixMatches[0] : '';

        if (attrName) {
            // Make sure the previous attribute is what ends at the current cursor position
            let matches = attrCompletionRegExp.exec(line);
            if (matches) {
                let expectedAttrName = matches[1];
                if (expectedAttrName === attrName) {
                    if (matches[2]) {
                        // The last attribute has a string value: foo="|
                        inspected.completionType = completionType.ATTR_VALUE;
                        inspected.attributeValueType = 'string';
                    } else {
                        inspected.completionType = completionType.ATTR_NAME;
                    }
                }
            }
        } else {
            // Make sure the previous tag name is what ends at the current cursor position
            let matches = tagCompletionRegExp.exec(line);
            if (matches) {
                let expectedTagName = matches[1];
                if (expectedTagName === tagName) {
                    let endingTagNameMatches = endingTagRegExp.exec(line);
                    if (endingTagNameMatches) {
                        // FIXME inspected.tagName should really be the last unclosed tag
                        inspected.completionType = completionType.TAG_END;
                        inspected.shouldCompleteEndingTag = endingTagBracketRegExp.exec(
                            this.lineFromPos(pos)) == null;
                        inspected.hasShorthand = false;
                    } else {
                        inspected.completionType = completionType.TAG_START;
                        if (!inspected.concise) {
                            if (this.isTagAtPos(pos)) {
                                inspected.shouldCompleteEndingTag = true;
                            }
                        }
                    }

                }
            }
        }

        // Check for shorthand but only if it is not a concise tag
        let shorthandMatches = tagShorthandRegExp.exec(tagName);
        if (shorthandMatches) {
            inspected.tagName = shorthandMatches[1];
            inspected.hasShorthand = true;
        }

        if (!inspected.completionType) {
            let scopeNames = this.getScopeNames(pos);
            if (scopeNames.length === 1 && scopeNames[0] === 'text.marko') {
                // See if we are positioned after an attribute
                if (this.isAfterAttribute(pos)) {
                    inspected.completionType = completionType.ATTR_NAME;
                }

                if (!inspected.completionType) {
                    if (tagName && inspected.concise === false) {
                        // See if we are completing an ending tag
                        let endingTagNameMatches = endingTagRegExp.exec(line);
                        if (endingTagNameMatches) {
                            let endingTagName = endingTagNameMatches[1] || '';
                            if (tagName.startsWith(endingTagName)) {
                                inspected.completionType = completionType.TAG_END;

                                inspected.shouldCompleteEndingTag = endingTagBracketRegExp.exec(
                                    this.lineFromPos(pos)) == null;
                                inspected.hasShorthand = false;
                            }
                        }
                    }
                }

                if (!inspected.completionType) {
                    if (line.endsWith('<')) {
                        inspected.completionType = completionType.TAG_START;
                        inspected.shouldCompleteEndingTag = true;
                    }
                }
            }
        }

        inspected.prefix = prefix;
        inspected.syntax = inspected.concise ? 'concise' : 'html';

        return inspected;
    }


    getScopeNames(pos) {
        if (!pos || pos === this.pos) {
            return this.scopeDescriptor.getScopesArray();
        } else {
            let scopeDescriptor = this.editor.scopeDescriptorForBufferPosition(pos);
            return scopeDescriptor.getScopesArray();
        }
    }

    charAt(pos) {
        var line = this.editor.lineTextForBufferRow(pos.row);
        return line.charAt(pos.column);
    }

    lineUpToPos(pos, inclusive) {
        var line = this.editor.lineTextForBufferRow(pos.row);
        return line.substring(0, inclusive ? pos.column + 1 : pos.column);
    }

    lineFromPos(pos) {
        var line = this.editor.lineTextForBufferRow(pos.row);
        return line.substring(pos.column);
    }

    lineAt(pos) {
        var line = this.editor.lineTextForBufferRow(pos.row);
        return line;
    }

    getPreviousPos(pos) {
        var row = pos.row;
        var column = pos.column;

        if (column === 0) {
            if (row === 0) {
                return null;
            }

            row--;

            let prevLine = this.editor.lineTextForBufferRow(row);
            if (prevLine.length) {
                column = prevLine.length - 1;
            } else {
                column = 0;
            }
        } else {
            column = column - 1;
        }

        return {row, column};
    }

    getTagNameFromPos(pos) {
        let curPos = this.getPreviousPos(pos);

        while(curPos) {
            let charAtPos = this.charAt(curPos);
            if (tagNameCharsRegExp.test(charAtPos)) {
                if (this.isTagAtPos(curPos)) {
                    let line = this.lineUpToPos(curPos, true /*inclusive*/);
                    var tagNameMatches = tagNameRegExp.exec(line);
                    if (tagNameMatches) {
                        return tagNameMatches[0];
                    }
                }
            }
            curPos = this.getPreviousPos(curPos);
        }

        return null;
    }

    getTagAndAttributeNameFromPos(pos) {
        let curPos = this.getPreviousPos(pos);


        var tagName;
        var attributeName;

        while(curPos) {
            let charAtPos = this.charAt(curPos);

            if (attrNameCharsRegExp.test(charAtPos) || (tagNameCharsRegExp.test(charAtPos))) {
                let scopeNames = this.getScopeNames(curPos);

                for (let i=0; i<scopeNames.length; i++) {
                    let scopeName = scopeNames[i];
                    var scopeInfo = scopesLookup[scopeName];
                    if (scopeInfo) {
                        if (scopeInfo.type === scopeType.TAG) {
                            // We found a tag name before we found any attributes so we are done
                            let line = this.lineUpToPos(curPos, true /*inclusive*/);
                            let tagNameMatches = tagNameRegExp.exec(line);
                            if (tagNameMatches) {
                                tagName = tagNameMatches[0];
                                return {
                                    tagName,
                                    attributeName,
                                    concise: scopeInfo.concise === true
                                };
                            } else {
                                return null;
                            }
                            break;
                        } else if (!attributeName && scopeInfo.type === scopeType.ATTR_NAME) {
                            let line = this.lineUpToPos(curPos, true /*inclusive*/);
                            var attrNameMatches = attrNameRegExp.exec(line);
                            if (attrNameMatches) {
                                attributeName = attrNameMatches[0];
                            } else {
                                return null;
                            }
                            break;
                        }
                    }
                }
            }

            curPos = this.getPreviousPos(curPos);
        }

        return null;
    }

    isTagAtPos(pos) {
        var scopeNames = this.getScopeNames(pos);

        for (let i=0; i<scopeNames.length; i++) {
            let scopeName = scopeNames[i];
            var scopeInfo = scopesLookup[scopeName];
            if (scopeInfo && scopeInfo.type === scopeType.TAG) {
                return true;
            }
        }

        return false;
    }

    isAttributeOrTagName(scopeNames) {
        for (let i=0; i<scopeNames.length; i++) {
            let scopeName = scopeNames[i];
            if (scopeName.endsWith('.js')) {
                return true;
            }

            var scopeInfo = scopesLookup[scopeName];
            if (scopeInfo && (
                scopeInfo.type === scopeType.ATTR_NAME ||
                scopeInfo.type === scopeType.ATTR_VALUE ||
                scopeInfo.type === scopeType.TAG)) {
                return true;
            }
        }

        return false;
    }

    isAfterAttribute(pos) {
        let curPos = this.getPreviousPos(pos);
        let hasWhitespace = false;

        while(curPos) {
            let charAtPos = this.charAt(curPos);
            if (charAtPos === '/' || charAtPos === '<') {
                break;
            } else if (/\s/.test(charAtPos)) {
                hasWhitespace = true;
            } else {

                let scopeNames = this.getScopeNames(curPos);

                if (scopeNames.length > 1) {
                    if (hasWhitespace && this.isAttributeOrTagName(scopeNames)) {
                        return true;
                    }

                    return false;
                }
            }

            if (curPos.column === 0) {
                break;
            } else {
                curPos = this.getPreviousPos(curPos);
            }
        }

        return false;
    }
}

module.exports = Inspector;