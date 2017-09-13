

// Constants
const DOMAIN = "https://api.staging.conctr.com";
const CONCTR_APP_ID = "f8d270509551421d814875f67e808c87";
const CONCTR_USR = "demo@edenworth.com";
const CONCTR_PASS = "Ewdemo2017";
const DEVICE = "2BF935";
const MAX_BUFFER_SIZE = 50;

var jwt = null;

// Variables
var metrics = {
    radio_temperature:     {chart: null, buffer: [], max: 400, min: -10},
    pressure:     {chart: null, buffer: [], max: 400, min: -10},
};

var chart = null;   // Chart object

function loginConctr() {

    // Send request to Conctr
    $.ajax({
        url: `${DOMAIN}/consumers/admin/${CONCTR_APP_ID}/login`,
        type: 'post',
        headers: {
            'Content-Type': 'application/json'
        },
        data: JSON.stringify({
            userData: {
                email: CONCTR_USR,
                pwd: CONCTR_PASS
            }
        }),
        dataType: 'json',
        success: function (response) {
            // Check the status code
            if (response.statusCode != 200 && response.statusCode != 201) {
                console.error(response.error);
                alertify.error("Unable to authenticate with Conctr");
                return;
            } else {
                alertify.success('Successfully logged in');
                jwt = response.jwt;

                initialise();
            }
        },
        error: function() {
        alertify.error('Invalid login details');
        }
    });

}

//----------------------------------
function initialise() {

    chart = new pulseApp();

    Highcharts.setOptions({    // This is for all plots, change Date axis to local timezone
        global : {
            useUTC : false
        }
    });
    
    chart.createChart();    

    loadDeviceData();
}

function loadDeviceData() {

    var now = new Date();
    now.setDate(now.getDate() - 14);

    // Create request body
    const body = {
        "select":["pulse1","_device_id","_ts"],
        "limit":50,
        "orderBy":[{"field":"_ts","desc":true}],
        "where":{
            "_ts":
                {
                    "type":"datetime",
                    "gt": now.toISOString()
                }
            }
        };

    // Create request parameters
    $.ajax({
        url: `https://api.staging.conctr.com/consumers/data/${CONCTR_APP_ID}/devices/historical/search/${DEVICE}`,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `jwt:${jwt}`
        },
        method: 'POST',
        data: JSON.stringify(body),
        success: function(resp) {

            chart.loadData(resp.data);
        },
        error: function(err) {
            console.log(JSON.stringify(err));
            if (err.responseJSON.statusCode == 401)
            {
                alertify.success('Token Expired.');
                signOut();
            }
        }
    });
}


// Load Pulse Application data
function pulseApp() {

    this.chart_pulse = null;

    this.current_pulse = $('#current_pulse');
    this.current_litre = $('#current_litre');

    this.createChart = function() {

        this.chart_pulse = Highcharts.chart('pulse_chart', {
            chart: {
                type: 'spline'
            },
            animation: Highcharts.svg,
            title: { text: 'Litres Consumed' },
            yAxis: {
                title: {
                    text: 'Litre (L)' 
                }
            }, 
            xAxis: {
                type: 'datetime',
                dateTimeLabelFormats: { // don't display the dummy year
                    month: '%e. %b',
                    year: '%b'
                },
                title: {
                    text: 'Date'
                }
            },
            plotOptions: {
                spline: {
                    marker: {
                        enabled: true
                    }
                }
            },
            // series: []
        });
    }

    this.loadData = function(data) {

        var dataTmp = [];

        if (data.current != null)
        {
            this.current_pulse.html(data.current.pulse1);
            this.current_litre.html(data.current.pulse1 * 5);
        }

        for (entry of data.historical.reverse()) {
            dataTmp.push( [Date.parse( entry._ts ), entry.pulse1 * 5] ); 
        }

        this.chart_pulse.addSeries({
            name: data.historical[0]._device_id.toString(),
            data: dataTmp
        });
    }

    this.checkSeriesExists = function(deviceId) {
        // Check if existing series
        if (this.chart_pulse.series.find(function(d) { return d.name === deviceId}))
        {
            return true;
        }

        // pressure chart..
        return false;
    }
}

//----------------------------------
function updateGraphs() {
    for (var metric in metrics) {
        for (var i = 1; i <= MAX_BUFFER_SIZE; i++) {
            var shift = metrics[metric].chart.series[0].data.length > 1000;
            var redraw = false;
            if (i == MAX_BUFFER_SIZE) {
                redraw = true;
            }

            // Make sure we don't overrun the buffer
            if (metrics[metric].buffer.length == 0) {
                metrics[metric].chart.redraw();
                break;
            }

            metrics[metric].chart.series[0].addPoint(metrics[metric].buffer[0], redraw, shift);
            metrics[metric].buffer.shift();

        }
    }
}