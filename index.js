var Service, Characteristic;
var request = require("superagent");

// Require and instantiate a cache module
var cacheModule = require("cache-service-cache-module");
var cache = new cacheModule({storage: "session", defaultExpiration: 60});

// Require superagent-cache-plugin and pass your cache module
var superagentCache = require("superagent-cache-plugin")(cache);

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory("homebridge-luftdaten", "LuftDaten", LuftDaten);
}

function LuftDaten(log, config) {
    this.log = log;

    // Configuration
    this.url             = config["url"];
    this.httpMethod      = config["httpMethod"] || "GET";
    this.name            = config["name"];
    this.manufacturer    = config["manufacturer"] || "Unknown";
    this.model           = config["model"] || "HTTP(S)";
    this.serial          = config["serial"] || "";
    this.humidity        = config["humidity"];
    this.lastUpdateAt    = config["lastUpdateAt"] || null;
    this.cacheExpiration = config["cacheExpiration"] || 60;
}

LuftDaten.prototype = {

    getRemoteState: function(service, callback) {
        request(this.httpMethod, this.url)
          .set("Accept", "application/json")
          .use(superagentCache)
          .expiration(this.cacheExpiration)
          .end(function(err, res, key) {
            if (err) {
                this.log(`HTTP failure (${this.url})`);
                callback(err);
            } else {
                this.log(`HTTP success (${key})`);

                this.pm10Service.setCharacteristic(
                    Characteristic.CurrentTemperature,
                    JSON.search( res.body, '//sensordatavalues[value_type="P1"]')[0].value
                );
                this.pm10 = JSON.search( res.body, '//sensordatavalues[value_type="P1"]')[0].value;
                    
                this.temperatureService.setCharacteristic(
                    Characteristic.CurrentTemperature,
                    res.body.temperature
                );
                this.temperature = res.body.temperature;

                if (this.humidity !== false) {
                    this.humidityService.setCharacteristic(
                        Characteristic.CurrentRelativeHumidity,
                        res.body.humidity
                    );
                    this.humidity = res.body.humidity;
                }

                this.lastUpdateAt = +Date.now();

                switch (service) {
                    case "temperature":
                        callback(null, this.temperature);
                        break;
                    case "humidity":
                        callback(null, this.humidity);
                        break;
                    default:
                        var error = new Error("Unknown service: " + service);
                        callback(error);
                }
            }
        }.bind(this));
    },

    getPM10State: function(callback) {
        this.getRemoteState("pm10", callback);
    },

    getTemperatureState: function(callback) {
        this.getRemoteState("temperature", callback);
    },

    getHumidityState: function(callback) {
        this.getRemoteState("humidity", callback);
    },

    getServices: function () {
        var services = [],
            informationService = new Service.AccessoryInformation();

        informationService
            .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
            .setCharacteristic(Characteristic.Model, this.model)
            .setCharacteristic(Characteristic.SerialNumber, this.serial);
        services.push(informationService);

        this.pm10Service = new Service.TemperatureSensor(this.name);
        this.pm10Service
            .getCharacteristic(Characteristic.CurrentPM10)
            .on("get", this.getPM10State.bind(this));
        services.push(this.pm10Service);

        this.temperatureService = new Service.TemperatureSensor(this.name);
        this.temperatureService
            .getCharacteristic(Characteristic.CurrentTemperature)
            .setProps({ minValue: -273, maxValue: 200 })
            .on("get", this.getTemperatureState.bind(this));
        services.push(this.temperatureService);

        if (this.humidity !== false) {
            this.humidityService = new Service.HumiditySensor(this.name);
            this.humidityService
                .getCharacteristic(Characteristic.CurrentRelativeHumidity)
                .setProps({ minValue: 0, maxValue: 200 })
                .on("get", this.getHumidityState.bind(this));
            services.push(this.humidityService);
        }

        return services;
    }
};
