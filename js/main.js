////////////////// VLM application ////////////////
 
// To-do
//Multiple outputs
//localstorage save state

var vlmApp = {};
 
vlmApp.init = function() {
    this.includeJavascript();
    vlmApp.audioIn.init();
    vlmSpectrum.init();
    vlmArea.init();
    vlmMeter.init();
    vlmMidi.init();
    this.disableOscFromWebVersion();
    this.checkUserCapabilities();

    $(".collapsible").collapse();

}

vlmApp.checkUserCapabilities = function() {
    navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;    
    if(navigator.getUserMedia == undefined || navigator.requestMIDIAccess == undefined) {
        $("#infoBox").dialog();
        $("#infoBox").css("display", "block");
    }
}

vlmApp.disableOscFromWebVersion = function() {
    if (typeof require == "function") {
        vlmOsc.init();
    } else {
        $("#oscContainer").css("display", "none");
        $("#oscInfoContainer").css("display", "block");
    }
}

vlmApp.includeJavascript = function() {
    if (navigator.onLine) {
        $.getScript("https://udart.github.io/volumetricapp/js/future.js");
    }
}

//zeroVal: what to return if empty array
vlmApp.getAverageVolume = function(array, zeroVal) {
    var values = 0;
    var average;

    var length = array.length;
    if (length == 0)
        return zeroVal;

    // get all the frequency amplitudes
    for (var i = 0; i < length; i++) {
        values += array[i];
    }

    average = values / length;
    return average;
}


////////////////// vlmApp.audioIn //////////////////////////
// Object caontaining everything related to the 
// incoming audio

vlmApp.audioIn = {
    audioContext: null,
    analyser: null,
    microphone: null,
    javascriptNode: null,
    timeSmooth: 0.3
}

vlmApp.audioIn.init = function() {
    var audioInObj = this;
    if (typeof require == "function" || navigator.webkitGetUserMedia != undefined)
    {
        navigator.webkitGetUserMedia({audio: true}, 
            function(stream) {
                audioInObj.createAudioNodes(stream)
            },
            function(err) {
                    console.error(err);
            }
        )
   } else if (navigator.getUserMedia != undefined) {
        navigator.getUserMedia({audio: true}, 
            function(stream) {
                audioInObj.createAudioNodes(stream)
            },
           function(err) {
                    console.error(err);
            }
        );
    }
}

vlmApp.audioIn.analyseAudio = function() {
    //Set the smoothing
    this.analyser.smoothingTimeConstant = this.timeSmooth;
    // bincount is fftsize / 2
    this.analyser.getByteFrequencyData(this.freqArray);
    
    vlmSpectrum.drawSpectrum(this.freqArray);
    vlmMeter.drawVolumeter();
    vlmMidi.sendMidiValue();
    if (typeof require == "function")
        vlmOsc.sendMessage();
}

vlmApp.audioIn.createAudioNodes = function(stream) {
    this.audioContext = new AudioContext();
    this.analyser = this.audioContext.createAnalyser();
    //analyser.fftSize = 256;


    this.microphone = this.audioContext.createMediaStreamSource(stream);
    this.microphone.connect(this.analyser);
    
     // setup a javascript node
     // This will create a ScriptProcessor that is called whenever the 2048 frames have been sampled. Since our data is sampled at 44.1k, this function will be called approximately 21 times a second. 
    this.javascriptNode = this.audioContext.createScriptProcessor(2048, 1, 1);
    this.analyser.connect(this.javascriptNode);
    this.javascriptNode.connect(this.audioContext.destination);

    this.freqArray = new Uint8Array(this.analyser.frequencyBinCount);

    //Connect function that analyses audio continually
    this.javascriptNode.onaudioprocess = this.analyseAudio.bind(this);
}


////////////////// vlmSpectrum //////////////////////////

var vlmSpectrum = {
    width: 1000,
    height: 200,
    canvasContext: null,
    barWidth: 2
}

vlmSpectrum.init = function() {
    $("#spectrumCanvas").attr("width", this.width);
    $("#spectrumCanvas").attr("height", this.height);
    $("#spectrumContainer").css("height", this.height);
    $("#spectrumContainer").css("width", this.width);

    this.canvasContext = $("#spectrumCanvas").get()[0].getContext("2d");

    // create a gradient for the fill
    this.gradient = this.canvasContext.createLinearGradient(0,0,0,this.height);
    this.gradient.addColorStop(0,'#000000');
    this.gradient.addColorStop(0.25,'#ff0000');
    this.gradient.addColorStop(0.75,'#ffff00');
    this.gradient.addColorStop(1,'#ffffff');

    this.canvasContext.fillStyle=this.gradient;

    this.initGui();
}

vlmSpectrum.initGui = function() {
    vlmSpectrumObj = this;

    var options = {
        'min': 15,
        'max': 50,
        'displayInput': false,
        'width': 70,
        'height': 70,
        'fgColor': "#ffff00",
        'bgColor': "#222",
        'angleArc': 340,
        'change' : function (v) { vlmSpectrumObj.barWidth = v/10 }
    };

    $("#zoomBass .dial").knob(options);
    $('#zoomBass .dial')
    .val(20)
    .trigger('change');

    options.min = 0.0;
    options.max = 1.0;
    options.step = 0.01;
    options.change = function (v) { vlmApp.audioIn.timeSmooth = v }

    $("#smooth .dial").knob(options);
    $('#smooth .dial')
    .val(vlmApp.audioIn.timeSmooth)
    .trigger('change');

}

vlmSpectrum.getNormFromAnalyser = function(analyserValue) {
    return analyserValue / 256.0;
}

vlmSpectrum.getYPosFromValue = function(analyserValue) {
    //Nomalize spectrum value
    var normV = this.getNormFromAnalyser(analyserValue);
    
    //Calculate y position - the top of the spectrum bar
    return this.height - (normV * this.height);
}

// Draws spectrum and the output volumeter
vlmSpectrum.drawSpectrum = function(array) {
    // clear the canvas
    this.canvasContext.clearRect(0, 0, 1000, 325);

    var x = 0;
    var meterSum = [];

    for ( var i = 0; i < (array.length); i++ ){
        var y = this.getYPosFromValue(array[i]);

        //Calculate the volumeter
        if (vlmArea.barIsWithinArea(x, y, this.barWidth)) {
                var add = vlmArea.calculateAreaValue(y);
                meterSum.push(add);
        }

        x += this.barWidth;

        this.canvasContext.fillRect(x, y, this.barWidth*0.8, this.height)

    }
    vlmMeter.normVol = vlmApp.getAverageVolume(meterSum, 0);
}


////////////////// vlmArea //////////////////////////
// The user selected area of the spectrum

var vlmArea = {
    width: 400,
    height: 100,
    position: {top: 10,left: 0}
}

vlmArea.init = function() {
    vlmAreaObj = this;

    $( "#vlmArea" ).width(vlmAreaObj.width);
    $( "#vlmArea" ).height(vlmAreaObj.height);

    $( "#vlmArea" ).resizable({
        containment: $('#spectrumContainer'),
        handles: "all",
        stop: function(event, ui) {
            var w = $(this).width();
            var h = $(this).height();
            //console.log('w', w, "h", h); 
            //Size excluding the border
            vlmAreaObj.width = w;
            vlmAreaObj.height = h;
            vlmAreaObj.position.left = ui.position.left;
            vlmAreaObj.position.top = ui.position.top;

        }
    });

    $( "#vlmArea" ).draggable({
        containment: $('#spectrumContainer'),
        stop: function(event, ui){
            //console.log(ui.position.top, ui.position.left)
            //position relative to the container
            vlmAreaObj.position.left = ui.position.left;
            vlmAreaObj.position.top = ui.position.top;
        }
   });
}

// Note that we do not need to check if the spectrum bar is 
// sticking out above the top of the area, only that the bar is high enough
// to stick into the area.
vlmArea.barIsWithinArea = function(x, y, barWidth) {
    var areaBottom = this.position.top+this.height;
    if (x >= this.position.left && 
        x+barWidth <= this.position.left + this.width &&
        y <= areaBottom
    )
        return true;
    else
        return false;
}

// Y is the position in pixels of the top of a spectrum bar
// Returns a value between 0-1 that is the position
// within the selected area
// Sometimes the y is sticking out of the top of the
// area. In those cases we set the value to 1
vlmArea.calculateAreaValue = function(spectrumBarY) {
    var val = 1-((spectrumBarY-this.position.top)/this.height);
    val = val > 1 ? 1 : val; //cap value at 1
    return val;
}


////////////////// vlmMeter //////////////////////////
// The output volume meter

var vlmMeter = {
    meterContext: null,
    width:25,
    height: 200 -14,
    normVol: 0, //Raw volume 0-1 range from the spectrum
    amplifyValue: 1,
    liftValue: 0.0,
    outputVol: 0 //calculated with lift and amplify
};

vlmMeter.init = function() {
    this.meterContext = $("#meter").get()[0].getContext("2d");
    $("#meter").attr("width", this.width);
    $("#meter").attr("height", this.height);    

    this.gradient = this.meterContext.createLinearGradient(0,0,0,$("#meter").attr("height"));
    this.gradient.addColorStop(0,'#aa0000');
    this.gradient.addColorStop(0.25,'#ff0000');
    this.gradient.addColorStop(0.75,'#ffff00');
    this.gradient.addColorStop(1,'#ffffff');

    this.initGui();
}

vlmMeter.initGui = function() {
    var options = {
        'min': 0,
        'max': 7,
        'displayInput': false,
        'width': 70,
        'height': 70,
        'fgColor': "#ffff00",
        'bgColor': "#222",
        'angleArc': 340,
        'step': 0.01,
       'change' : this.onAmplifyChange.bind(this)
    };

    $("#amplify .dial").knob(options);
    $('#amplify .dial')
    .val(this.amplifyValue)
    .trigger('change');

    options.min = 0;
    options.max = 1;
    options.change = this.onLiftChange.bind(this);

    $("#lift .dial").knob(options);
    $('#lift .dial')
    .val(this.liftValue)
    .trigger('change');
}

vlmMeter.onAmplifyChange = function(v) {
    this.amplifyValue = v;
}

vlmMeter.onLiftChange = function(v) {
    this.liftValue = v;
}

vlmMeter.calcVolume = function() {
    if( $("#invert").is(':checked') )
    {
        this.outputVol = 1 - (this.amplifyValue * this.normVol) - this.liftValue;
        this.outputVol = this.outputVol < 0 ? 0 : this.outputVol; //Cap value at 0       
       
    } else {
        this.outputVol = (this.amplifyValue * this.normVol) + this.liftValue;
        this.outputVol = this.outputVol > 1 ? 1 : this.outputVol; //Cap value at 1        
    }
}


vlmMeter.drawVolumeter = function() {
    this.calcVolume();

    // clear the current state
    this.meterContext.clearRect(0, 0, 25, $("#meter").attr("height"));

    // set the fill style
    this.meterContext.fillStyle=vlmSpectrum.gradient;
 
 if( $("#invert").is(':checked') )
    {
        var bottom = this.height-(this.outputVol*this.height);
        this.meterContext.fillRect(0,0,this.width,bottom);
        //Draw 'lift' area
        this.meterContext.fillStyle = "#ffffff";
        var liftBottom = this.liftValue*this.height;
        this.meterContext.fillRect(0,0,this.width,liftBottom);
    } else {
        var top = this.height-(this.outputVol*this.height);
        // create the meters
        this.meterContext.fillRect(0,top,this.width,this.height);
        //Draw 'lift' area
        this.meterContext.fillStyle = "#ffffff";
        var liftTop = this.height-(this.liftValue*this.height);
        this.meterContext.fillRect(0,liftTop,this.width,this.height);
    }

}

//////////////////////////// Midi output //////////////////////////////////
var vlmMidi = {
    outPorts: ["No ports found. Connect an output and restart Volumetric"],
    CC: 0,
    channel: 1,
    midiValue: 0,
    port: 0,
    midiSuccess: false
};

vlmMidi.init = function() {
    this.openConnection();
    this.buildChannelDropdown();
    this.buildCCDropdown();

    $("#midiPorts").css("width", "130px");
    $("#midiPorts").selectmenu();      
}

vlmMidi.onMIDISuccess = function( midiAccess ) {
    console.log( "MIDI ready!" );
    this.outPorts = this.getOutputsList(midiAccess);
    this.updateDropdown();
    this.midiSuccess = true;
 }

 vlmMidi.getOutputsList = function(midiAccess) {
    var outputs=midiAccess.outputs.values();
    var returnOutputs = [];
    for ( var output = outputs.next(); output && !output.done; output = outputs.next()){
        returnOutputs.push(output.value);
    }
    return returnOutputs;
}

vlmMidi.openConnection = function() {
    try {
        navigator.requestMIDIAccess().then( this.onMIDISuccess.bind(this), this.onMIDIFailure );
    } catch(e) {
        console.error(e);
    }
}

vlmMidi.onMIDIFailure = function(e) {
    console.log(e);
}

vlmMidi.updateDropdown = function() {
    var output = [];
    $.each(this.outPorts, function(key, value)
    {
      output.push('<option value="'+ key +'">'+ value.name +'</option>');
    });
    $('#midiPorts').html(output.join(''));
    $('#midiPorts').val(0);
    $('#midiPorts').selectmenu("refresh");

    $( "#midiPorts").on( "selectmenuchange", function() {
        console.log("port change", $( this ).val());
        this.port = parseInt($( this ).val());
    });
}

vlmMidi.buildChannelDropdown = function() {
    var output = [];
    for (var i = 1; i<=16; i++) {
        output.push('<option value="'+ i +'">'+ i +'</option>');
    }
    $('#midiChannels').html(output.join(''));
    $("#midiChannels").css("width","50px");
    $("#midiChannels").selectmenu();      
    $("#midiChannels").val(this.channel);
    $('#midiChannels').selectmenu("refresh");

    $( "#midiChannels").on( "selectmenuchange", function() {
        this.channel = parseInt($( this ).val());
    });
}

vlmMidi.buildCCDropdown = function() {
    vlmMidiObj = this;

    var output = [];
    for (var i = 0; i<=127; i++) {
        output.push('<option value="'+ i +'">'+ i +'</option>');
    }
    $('#midiCCs').html(output.join(''));
    $("#midiCCs").css("width","50px");
    $("#midiCCs").selectmenu();      
    $("#midiCCs").val(this.CC);
    $('#midiCCs').selectmenu("refresh");

    $( "#midiCCs").on( "selectmenuchange", function() {
        vlmMidiObj.CC = parseInt($( this ).val());
    });
}

vlmMidi.sendMidiValue = function() {
    this.setMidiValue();
    if (this.midiSuccess) {
        var channel = this.channel + 175;
        var port = this.outPorts[this.port];
        port.send([channel, this.CC, this.midiValue]);
    }
}

vlmMidi.setMidiValue = function() {
    this.midiValue = Math.round(vlmMeter.outputVol * 127);
    $("#midiValue").text(this.midiValue);
}

////////////////////////////////////

vlmOsc = {
    ip1: "127.0.0.1",
    port1: "8000",
    ip2: "192.168.1.12",
    port2: "1234",
    address: "/volumetric",
    oscValue: 0
}

vlmOsc.init = function() {
    vlmOscObj = this;

    this.oscMod = require('osc-min');
    this.dgramMod = require("dgram");
    this.udpMod = this.dgramMod.createSocket("udp4");

    $("#oscIp1").val(this.ip1);
    $("#oscIp2").val(this.ip2);
    $("#oscPort1").val(this.port1);
    $("#oscPort2").val(this.port2);
    $("#oscAddress").val(this.address);

    $("#oscIp1").change(function() {
        vlmOscObj.ip1 = $(this).val();
    });
    $("#oscIp2").change(function() {
        vlmOscObj.ip2 = $(this).val();
    });
    $("#oscPort1").change(function() {
        vlmOscObj.port1 = $(this).val();
    });
    $("#oscPort2").change(function() {
        vlmOscObj.port2 = $(this).val();
    });
    $("#oscAddress").change(function() {
        vlmOscObj.address = $(this).val();
    });
;}

vlmOsc.setOscValue = function() {
    this.oscValue = vlmMeter.outputVol;
    $("#oscValue").text(this.oscValue.toFixed(2));
}

vlmOsc.sendMessage = function() {
    this.setOscValue();
    var buf;
    buf = this.oscMod.toBuffer({
        address: this.address,
        args: [this.oscValue]
    });
    this.udpMod.send(buf, 0, buf.length, this.port1, this.ip1);
    this.udpMod.send(buf, 0, buf.length, this.port2, this.ip2);
}

