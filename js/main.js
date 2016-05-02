////////////////// VLM application ////////////////
 
// To-do
//localstorage save state
// Don't delete object, just disable it? the midi, the osc, the drawing of the spectrum

var vlmApp = {};
 
vlmApp.init = function() {
    this.includeJavascript();
    this.audioIn.init();

    this.objects = [];
    this.objects[0] = new vlmObject(0);

    this.checkUserCapabilities();
}

vlmApp.checkUserCapabilities = function() {
    navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;    
    if(navigator.getUserMedia == undefined || navigator.requestMIDIAccess == undefined) {
        $("#infoBox").dialog();
        $("#infoBox").css("display", "block");
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

//Insert leading zero(s)
vlmApp.padNum = function(num, size) {
    var s = "000000000" + num;
    return s.substr(s.length-size);
}

vlmApp.getLastEnabledObject = function() {
    var enabledObject = 0;
    for(var i = 0; i < vlmApp.objects.length; i++) {
        if (vlmApp.objects[i].enabled)
            enabledObject = i;
    }
    return enabledObject;
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
    
    for (var i in vlmApp.objects) {
        if (vlmApp.objects[i].enabled) {
            vlmApp.objects[i].spectrum.drawSpectrum(this.freqArray);
            vlmApp.objects[i].meter.drawVolumeter();
            vlmApp.objects[i].midi.sendMidiValue();
            if (typeof require == "function")
                vlmApp.objects[i].osc.sendMessage();
        }
    }
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

////////////////// vlmObj //////////////////////////////////
// This object holds all the info regarding one instance of 
// a group that holds the spectrum, the midi and osc outputs

var vlmObject = function(objectIndex) {
    this.enabled = true;
    this.index = objectIndex;
    this.cssId = "#object" + vlmApp.padNum(this.index, 2);

    //Create html code for the new object
    this.createNewObjectHtml();

    this.spectrum = new vlmSpectrum(this);
    this.area = new vlmArea(this);
    this.meter = new vlmMeter(this);
    this.midi = new vlmMidi(this);

    this.disableOscFromWebVersion();
    this.initGui();
}

vlmObject.prototype.initGui = function() {
    $(this.cssId).find(".collapsible").collapse();
    $(this.cssId).find(".plusone").click(function() {
        var newId = vlmApp.objects.length;        
        vlmApp.objects.push(new vlmObject(newId));
    });
}

vlmObject.prototype.disableOscFromWebVersion = function() {
    if (typeof require == "function") {
        this.osc = new vlmOsc(this);
    } else {
        $("#oscContainer").css("display", "none");
        $("#oscInfoContainer").css("display", "block");
    }
}

//All html is in a hidden div and a new object is created by copying
// the contents of this div
vlmObject.prototype.createNewObjectHtml = function() {
    var thisObject = this;
    var htmlId = "object" + vlmApp.padNum(this.index, 2);
    $("body").append('<div id="' + htmlId + '"></div>');
    $("#originalObject").contents().clone().appendTo(this.cssId);
    $(".plusone").hide();
    $(this.cssId).find(".plusone").show(); 
    if (this.index == 0) {
        $(this.cssId).find("#close").hide();
    }

    //Close button
    $(this.cssId).find("#close").click(function() {
        //Remove object
        thisObject.enabled = false;
        $(thisObject.cssId).remove();
        //Hide all plus signs then show the last one
        $(".plusone").hide();
        var lastObjectCssId = "#object" + vlmApp.padNum(vlmApp.getLastEnabledObject(),2);
        $(lastObjectCssId).find(".plusone").show(); 
    });
}

////////////////// vlmSpectrum //////////////////////////

var vlmSpectrum = function(containerObj) {
    this.obj = containerObj;
    this.width = 1000;
    this.height = 200;
    this.barWidth = 2;

    $(this.obj.cssId).find("#spectrumCanvas").attr("width", this.width);
    $(this.obj.cssId).find("#spectrumCanvas").attr("height", this.height);
    $(this.obj.cssId).find("#spectrumContainer").css("height", this.height);
    $(this.obj.cssId).find("#spectrumContainer").css("width", this.width);

    this.canvasContext = $(this.obj.cssId).find("#spectrumCanvas").get()[0].getContext("2d");

    // create a gradient for the fill
    this.gradient = this.canvasContext.createLinearGradient(0,0,0,this.height);
    this.gradient.addColorStop(0,'#000000');
    this.gradient.addColorStop(0.25,'#ff0000');
    this.gradient.addColorStop(0.75,'#ffff00');
    this.gradient.addColorStop(1,'#ffffff');

    this.canvasContext.fillStyle=this.gradient;

    this.initGui();
}

vlmSpectrum.prototype.initGui = function() {
    var vlmSpectrumObj = this;

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

    $(this.obj.cssId).find("#zoomBass .dial").knob(options);
    $(this.obj.cssId).find('#zoomBass .dial')
    .val(20)
    .trigger('change');

    options.min = 0.0;
    options.max = 1.0;
    options.step = 0.01;
    options.change = function (v) { 
        vlmApp.audioIn.timeSmooth = v;
        //Link all 'smooth' dials because we can only have one smooth value
        $('#smooth .dial').val(vlmApp.audioIn.timeSmooth).trigger('change');
    }

    $(this.obj.cssId).find("#smooth .dial").knob(options);
    $(this.obj.cssId).find('#smooth .dial')
    .val(vlmApp.audioIn.timeSmooth)
    .trigger('change');

}

vlmSpectrum.prototype.getNormFromAnalyser = function(analyserValue) {
    return analyserValue / 256.0;
}

vlmSpectrum.prototype.getYPosFromValue = function(analyserValue) {
    //Nomalize spectrum value
    var normV = this.getNormFromAnalyser(analyserValue);
    
    //Calculate y position - the top of the spectrum bar
    return this.height - (normV * this.height);
}

// Draws spectrum and the output volumeter
vlmSpectrum.prototype.drawSpectrum = function(array) {
    // clear the canvas
    this.canvasContext.clearRect(0, 0, 1000, 325);

    var x = 0;
    var meterSum = [];

    for ( var i = 0; i < (array.length); i++ ){
        var y = this.getYPosFromValue(array[i]);

        //Calculate the volumeter
        if (this.obj.area.barIsWithinArea(x, y, this.barWidth)) {
                var add = this.obj.area.calculateAreaValue(y);
                meterSum.push(add);
        }

        x += this.barWidth;

        this.canvasContext.fillRect(x, y, this.barWidth*0.8, this.height)

    }
    this.obj.meter.normVol = vlmApp.getAverageVolume(meterSum, 0);
}


////////////////// vlmArea //////////////////////////
// The user selected area of the spectrum

var vlmArea = function(containerObj) {
    this.obj = containerObj;
    this.width = 400;
    this.height = 100;
    this.position = {top: 10,left: 0};

    var vlmAreaObj = this;

    $(this.obj.cssId).find( "#vlmArea" ).width(vlmAreaObj.width);
    $(this.obj.cssId).find( "#vlmArea" ).height(vlmAreaObj.height);

    $(this.obj.cssId).find( "#vlmArea" ).resizable({
        containment: $(this.obj.cssId).find('#spectrumContainer'),
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

    $(this.obj.cssId).find( "#vlmArea" ).draggable({
        containment: $(this.obj.cssId).find('#spectrumContainer'),
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
vlmArea.prototype.barIsWithinArea = function(x, y, barWidth) {
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
vlmArea.prototype.calculateAreaValue = function(spectrumBarY) {
    var val = 1-((spectrumBarY-this.position.top)/this.height);
    val = val > 1 ? 1 : val; //cap value at 1
    return val;
}


////////////////// vlmMeter //////////////////////////
// The output volume meter

var vlmMeter = function(containerObj) {
    this.obj = containerObj;
    this.width = 25;
    this.height = 200 -14;
    this.normVol = 0; //Raw volume 0-1 range from the spectrum
    this.amplifyValue = 1;
    this.liftValue = 0.0;
    this.outputVol = 0; //calculated with lift and amplify

    this.meterContext = $(this.obj.cssId).find("#meter").get()[0].getContext("2d");
    $(this.obj.cssId).find("#meter").attr("width", this.width);
    $(this.obj.cssId).find("#meter").attr("height", this.height);    

    this.gradient = this.meterContext.createLinearGradient(0,0,0,$(this.obj.cssId).find("#meter").attr("height"));
    this.gradient.addColorStop(0,'#aa0000');
    this.gradient.addColorStop(0.25,'#ff0000');
    this.gradient.addColorStop(0.75,'#ffff00');
    this.gradient.addColorStop(1,'#ffffff');

    this.initGui();
}

vlmMeter.prototype.initGui = function() {
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

    $(this.obj.cssId).find("#amplify .dial").knob(options);
    $(this.obj.cssId).find('#amplify .dial')
    .val(this.amplifyValue)
    .trigger('change');

    options.min = 0;
    options.max = 1;
    options.change = this.onLiftChange.bind(this);

    $(this.obj.cssId).find("#lift .dial").knob(options);
    $(this.obj.cssId).find('#lift .dial')
    .val(this.liftValue)
    .trigger('change');
}

vlmMeter.prototype.onAmplifyChange = function(v) {
    this.amplifyValue = v;
}

vlmMeter.prototype.onLiftChange = function(v) {
    this.liftValue = v;
}

vlmMeter.prototype.calcVolume = function() {
    if( $(this.obj.cssId).find("#invert").is(':checked') )
    {
        this.outputVol = 1 - (this.amplifyValue * this.normVol) - this.liftValue;
        this.outputVol = this.outputVol < 0 ? 0 : this.outputVol; //Cap value at 0       
       
    } else {
        this.outputVol = (this.amplifyValue * this.normVol) + this.liftValue;
        this.outputVol = this.outputVol > 1 ? 1 : this.outputVol; //Cap value at 1        
    }
}


vlmMeter.prototype.drawVolumeter = function() {
    this.calcVolume();

    // clear the current state
    this.meterContext.clearRect(0, 0, 25, $(this.obj.cssId).find("#meter").attr("height"));

    // set the fill style
    this.meterContext.fillStyle=this.obj.spectrum.gradient;
 
 if( $(this.obj.cssId).find("#invert").is(':checked') )
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
var vlmMidi = function(containerObj) {
    this.obj = containerObj;
    this.outPorts = ["No ports found. Connect an output and restart Volumetric"];
    this.port = "";
    this.CC = this.obj.index;
    this.channel = 1
    this.midiValue = 0;
    this.port = 0;
    this.midiSuccess = false;

    this.openConnection();
    this.buildChannelDropdown();
    this.buildCCDropdown();

    $(this.obj.cssId).find("#midiPorts").css("width", "130px");
    $(this.obj.cssId).find("#midiPorts").selectmenu();      
}

//Triggered when midi connection is successful
vlmMidi.prototype.onMIDISuccess = function( midiAccess ) {
    console.log( "MIDI ready!" );
    this.outPorts = this.getOutputsList(midiAccess);
    this.updateDropdown();
    this.midiSuccess = true;
 }

 vlmMidi.prototype.getOutputsList = function(midiAccess) {
    var outputs=midiAccess.outputs.values();
    var returnOutputs = [];
    for ( var output = outputs.next(); output && !output.done; output = outputs.next()){
        returnOutputs.push(output.value);
    }
    return returnOutputs;
}

vlmMidi.prototype.openConnection = function() {
    try {
        navigator.requestMIDIAccess().then( this.onMIDISuccess.bind(this), this.onMIDIFailure );
    } catch(e) {
        console.error(e);
    }
}

vlmMidi.prototype.onMIDIFailure = function(e) {
    console.log(e);
}

vlmMidi.prototype.updateDropdown = function() {
    var output = [];
    $.each(this.outPorts, function(key, value)
    {
      output.push('<option value="'+ value.name +'">'+ value.name +'</option>');
    });
    $(this.obj.cssId).find('#midiPorts').html(output.join(''));
    $(this.obj.cssId).find('#midiPorts').val(0);
    $(this.obj.cssId).find('#midiPorts').selectmenu("refresh");

    $(this.obj.cssId).find( "#midiPorts").on( "selectmenuchange", function() {
        console.log("port change", $( this ).val());
        this.port = $( this ).val();
    });
}

vlmMidi.prototype.buildChannelDropdown = function() {
    var output = [];
    for (var i = 1; i<=16; i++) {
        output.push('<option value="'+ i +'">'+ i +'</option>');
    }
    $(this.obj.cssId).find('#midiChannels').html(output.join(''));
    $(this.obj.cssId).find("#midiChannels").css("width","50px");
    $(this.obj.cssId).find("#midiChannels").selectmenu();      
    $(this.obj.cssId).find("#midiChannels").val(this.channel);
    $(this.obj.cssId).find('#midiChannels').selectmenu("refresh");

    $(this.obj.cssId).find( "#midiChannels").on( "selectmenuchange", function() {
        this.channel = parseInt($( this ).val());
    });
}

vlmMidi.prototype.buildCCDropdown = function() {
    var vlmMidiObj = this;

    var output = [];
    for (var i = 0; i<=127; i++) {
        output.push('<option value="'+ i +'">'+ i +'</option>');
    }
    $(this.obj.cssId).find('#midiCCs').html(output.join(''));
    $(this.obj.cssId).find("#midiCCs").css("width","50px");
    $(this.obj.cssId).find("#midiCCs").selectmenu();      
    $(this.obj.cssId).find("#midiCCs").val(this.CC);
    $(this.obj.cssId).find('#midiCCs').selectmenu("refresh");

    $(this.obj.cssId).find( "#midiCCs").on( "selectmenuchange", function() {
        vlmMidiObj.CC = parseInt($( this ).val());
    });
}

vlmMidi.prototype.sendMidiValue = function() {
    this.setMidiValue();
    if (this.midiSuccess) {
        var channel = this.channel + 175;
        var port = this.outPorts[this.port];
        port.send([channel, this.CC, this.midiValue]);
    }
}

vlmMidi.prototype.setMidiValue = function() {
    this.midiValue = Math.round(this.obj.meter.outputVol * 127);
    $(this.obj.cssId).find("#midiValue").text(this.midiValue);
}

////////////////////////////////////

vlmOsc = function(containerObj) {
    this.obj = containerObj;
    this.ip1 = "127.0.0.1";
    this.port1 = "8000";
    this.ip2 = "192.168.1.12";
    this.port2 = "1234";
    this.address = "/volumetric" + this.obj.index;
    this.oscValue = 0;

    var vlmOscObj = this;

    this.oscMod = require('osc-min');
    this.dgramMod = require("dgram");
    this.udpMod = this.dgramMod.createSocket("udp4");

    $(this.obj.cssId).find("#oscIp1").val(this.ip1);
    $(this.obj.cssId).find("#oscIp2").val(this.ip2);
    $(this.obj.cssId).find("#oscPort1").val(this.port1);
    $(this.obj.cssId).find("#oscPort2").val(this.port2);
    $(this.obj.cssId).find("#oscAddress").val(this.address);

    $(this.obj.cssId).find("#oscIp1").change(function() {
        vlmOscObj.ip1 = $(this).val();
    });
    $(this.obj.cssId).find("#oscIp2").change(function() {
        vlmOscObj.ip2 = $(this).val();
    });
    $(this.obj.cssId).find("#oscPort1").change(function() {
        vlmOscObj.port1 = $(this).val();
    });
    $(this.obj.cssId).find("#oscPort2").change(function() {
        vlmOscObj.port2 = $(this).val();
    });
    $(this.obj.cssId).find("#oscAddress").change(function() {
        vlmOscObj.address = $(this).val();
    });
;}

vlmOsc.prototype.setOscValue = function() {
    this.oscValue = this.obj.meter.outputVol;
    $(this.obj.cssId).find("#oscValue").text(this.oscValue.toFixed(2));
}

vlmOsc.prototype.sendMessage = function() {
    this.setOscValue();
    var buf;
    buf = this.oscMod.toBuffer({
        address: this.address,
        args: [this.oscValue]
    });
    this.udpMod.send(buf, 0, buf.length, this.port1, this.ip1);
    this.udpMod.send(buf, 0, buf.length, this.port2, this.ip2);
}

