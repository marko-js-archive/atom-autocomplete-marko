var completionType = require('./completion-type');
var scopeType = require('./scope-type');

var tagShorthandRegExp = /([a-zA-Z0-9_-]+)[#.][a-zA-Z0-9_#.:-]+/;

var prefixRegExp = /[A-Za-z0-9_\-\.\#]+$/;

var tagNameCharsRegExp = /[a-zA-Z0-9_#.:-]/;

var tagNameRegExp = /[a-zA-Z0-9.\-:]+$/;

var attrNameCharsRegExp = /[a-zA-Z0-9_#.:-]/;

var attrNameRegExp = /[a-zA-Z0-9.\-:]+$/;

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

class Inspector {
    constructor(request) {
        var editor = request.editor;
        this.editor = editor;

        var bufferPosition = request.bufferPosition;
        var line = this.lineUpToPos(bufferPosition);
        var scopeDescriptor = request.scopeDescriptor;

        var prefixMatches = prefixRegExp.exec(line);
        var prefix = prefixMatches ? prefixMatches[0] : '';

        this.pos = bufferPosition;
        this.line = line;
        this.prefix = prefix;
        this.scopeDescriptor = scopeDescriptor;
    }

    inspect(pos) {
        pos = pos || this.pos;

        let scopeNames = this.getScopeNames(pos);

        if (scopeNames.length === 1 && scopeNames[0] === 'text.marko') {
            // It looks like we are outside the scope of any interesting tag.
            // We need to scan backwards to find the previous completionType
            let prevInspected = this.inspectPrevToken(pos);
            if (prevInspected) {
                if (prevInspected.completionType === completionType.TAG_START) {
                    // The previous completionType was a tag start. If there was any whitespace
                    // then we are doing autocomplete for attributes
                    if (prevInspected.hasWhitespace) {
                        prevInspected.completionType = completionType.ATTR_NAME;
                        prevInspected.tagName = this.getTagNameFromPos(pos);
                    } else {
                        // Looks like we are at the end of the tag name: <sp|>...
                        // We don't want to complete the ending tag when doing the
                        // autocomplete since there is already an ending '>'
                        prevInspected.shouldCompleteEndingTag = false;
                    }
                } else if (prevInspected.completionType === completionType.ATTR_NAME ||
                           prevInspected.completionType === completionType.ATTR_VALUE) {

                    if (prevInspected.hasWhitespace) {
                        prevInspected.completionType = completionType.ATTR_NAME;
                        prevInspected.tagName = this.getTagNameFromPos(pos);
                    }
                }

                return prevInspected;
            }
        }

        let inspected = {};

        for (let i=0; i<scopeNames.length; i++) {
            let scopeName = scopeNames[i];
            var scopeInfo = scopesLookup[scopeName];
            if (scopeInfo) {
                inspected.concise = scopeInfo.concise;

                if (scopeInfo.type === scopeType.TAG) {
                    inspected.completionType = completionType.TAG_START;
                    inspected.shouldCompleteEndingTag = true;
                } else if (scopeInfo.type === scopeType.ATTR_NAME) {
                    inspected.completionType = completionType.ATTR_NAME;
                    inspected.tagName = this.getTagNameFromPos(pos);
                    inspected.shouldCompleteAttributeValue = scopeInfo.shouldCompleteAttributeValue;
                } else if (scopeInfo.type === scopeType.STRING) {
                    let tagAndAttrName = this.getTagAndAttributeNameFromPos(pos);
                    if (tagAndAttrName) {
                        inspected.completionType = completionType.ATTR_VALUE;
                        inspected.tagName = tagAndAttrName.tagName;
                        inspected.attributeName = tagAndAttrName.attributeName;

                        if (this.charAt(pos) !== '') {
                            inspected.attributeValueType = 'string';
                        }
                    }
                } else if (scopeInfo.type === scopeType.ATTR_NAME_VALUE_SEPARATOR) {
                    if (this.charAt(pos) === '=') {
                        // Cursor is positioned at: name|=foo
                        // We are are completing the attribute name
                        inspected.completionType = completionType.ATTR_NAME;
                        inspected.shouldCompleteAttributeValue = false;
                    } else {
                        // Cursor is positioned at: name=|<EOL>
                        // We are are completing the attribute value
                        inspected.completionType = completionType.ATTR_VALUE;
                    }

                    let tagAndAttrName = this.getTagAndAttributeNameFromPos(pos);
                    if (tagAndAttrName) {
                        inspected.tagName = tagAndAttrName.tagName;
                        inspected.attributeName = tagAndAttrName.attributeName;

                    }
                }

                break;
            } else if (scopeName.endsWith('.js')) {
                let tagAndAttrName = this.getTagAndAttributeNameFromPos(pos);
                if (tagAndAttrName) {
                    if (tagAndAttrName.attributeName) {
                        inspected.completionType = completionType.ATTR_VALUE;
                        inspected.tagName = tagAndAttrName.tagName;
                        inspected.attributeName = tagAndAttrName.attributeName;
                    } else {
                        inspected.completionType = completionType.TAG_START;
                        inspected.tagName = tagAndAttrName.tagName;
                    }

                }
            }
        }

        if (inspected.completionType === completionType.TAG_START) {
            if (inspected.concise !== true) {
                // Check for shorthand but only if it is not a concise tag
                let shorthandMatches = tagShorthandRegExp.exec(this.prefix);
                if (shorthandMatches) {
                    inspected.shorthandTagName = shorthandMatches[1];
                    inspected.hasShorthand = true;
                }
            }

        } else if (!inspected.completionType) {
            var beforeText = this.line.substring(0, this.pos.column - this.prefix.length);

            if (beforeText.endsWith('</')) {
                inspected.completionType = completionType.TAG_END;

                let afterText =  this.lineAt(this.pos).substring(this.pos.column);
                if (!afterText.startsWith('>')) {
                    inspected.shouldCompleteEndingTag = true;
                }
            } else if (beforeText.endsWith('<')) {
                inspected.completionType = completionType.TAG_START;
            }
        }

        inspected.syntax = inspected.concise ? 'concise' : 'html';
        inspected.prefix = this.prefix;

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

            if (attributeName) {
                // We already found the attribute name and
                // now looking for the tag name.
                if (tagNameCharsRegExp.test(charAtPos)) {
                    if (this.isTagAtPos(curPos)) {
                        let line = this.lineUpToPos(curPos, true /*inclusive*/);
                        let tagNameMatches = tagNameRegExp.exec(line);
                        if (tagNameMatches) {
                            tagName = tagNameMatches[0];
                            return {
                                tagName,
                                attributeName
                            };
                        }
                    }
                }
            } else {
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
                                        tagName
                                    };
                                } else {
                                    return null;
                                }
                            } else if (scopeInfo.type === scopeType.ATTR_NAME) {
                                let line = this.lineUpToPos(curPos, true /*inclusive*/);
                                var attrNameMatches = attrNameRegExp.exec(line);
                                if (attrNameMatches) {
                                    attributeName = attrNameMatches[0];
                                } else {
                                    return null;
                                }
                            }
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

    isAttributeAtPos(pos) {
        var scopeNames = this.getScopeNames(pos);

        for (let i=0; i<scopeNames.length; i++) {
            let scopeName = scopeNames[i];
            var scopeInfo = scopesLookup[scopeName];
            if (scopeInfo && scopeInfo.type === scopeType.ATTR_NAME) {
                return true;
            }
        }

        return false;
    }

    inspectPrevToken(pos) {
        let curPos = this.getPreviousPos(pos);
        let hasWhitespace;

        while(curPos) {
            let charAtPos = this.charAt(curPos);
            if (charAtPos === '/' || charAtPos === '<') {
                break;
            } else if (/\s/.test(charAtPos)) {
                hasWhitespace = true;
            } else {
                let scopeNames = this.getScopeNames(curPos);

                if (scopeNames.length > 1) {
                    let inspected = this.inspect(curPos);
                    inspected.hasWhitespace = hasWhitespace;
                    return inspected;
                }
            }

            if (curPos.column === 0) {
                break;
            } else {
                curPos = this.getPreviousPos(curPos);
            }
        }

        return null;
    }
}

module.exports = Inspector;