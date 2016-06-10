var provider;

provider = require('./provider');

module.exports = {
    activate: function() {
        return provider.onActivate()
            .then(() => {
                return require('atom-package-deps').install('autocomplete-marko');
            })
            .catch((e) => {
                console.log(e);
            });
    },
    getProvider: function() {
        return provider;
    }
};