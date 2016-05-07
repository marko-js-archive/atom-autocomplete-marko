var provider;

provider = require('./provider');

module.exports = {
    activate: function() {
        return provider.onActivate();
    },
    getProvider: function() {
        return provider;
    }
};