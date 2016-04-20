////////////////// VLM application ////////////////
 
var vlm = {};
 
vlm.init = function() {
    vlmIn.init();
    vlmSpectrum.init();
    vlmArea.init();
    vlmMeter.init();
 }

//zeroVal: what to return if empty array
vlm.getAverageVolume = function(array, zeroVal) {
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


////////////////// vlmIn //////////////////////////
// Object caontaining everything related to the 
// incoming audio

var vlmIn = {
    audioContext: null,
    analyser: null,
    microphone: null,
    javascriptNode: null,
    timeSmooth: 0.3
}

vlmIn.init = function() {
    navigator.webkitGetUserMedia({audio: true}, vlmIn.createAudioNodes,
            function(err) {
                console.error(err);
            }
    )
}

vlmIn.analyseAudio = function() {
    //Set the smoothing
    vlmIn.analyser.smoothingTimeConstant = vlmIn.timeSmooth;
    // bincount is fftsize / 2
    vlmIn.analyser.getByteFrequencyData(vlmIn.freqArray);
    
    //Draw the spectrum to the canvas
    vlmSpectrum.drawSpectrum(vlmIn.freqArray);
    //Draw the volumeter
    vlmMeter.drawVolumeter();
}

vlmIn.createAudioNodes = function(stream) {
    vlmIn.audioContext = new AudioContext();
    vlmIn.analyser = vlmIn.audioContext.createAnalyser();
    //analyser.fftSize = 256;


    vlmIn.microphone = vlmIn.audioContext.createMediaStreamSource(stream);
    vlmIn.microphone.connect(vlmIn.analyser);
    
    vlmIn.microphone.connect(vlmIn.audioContext.destination); //Monitor audio

     // setup a javascript node
     // This will create a ScriptProcessor that is called whenever the 2048 frames have been sampled. Since our data is sampled at 44.1k, this function will be called approximately 21 times a second. 
    vlmIn.javascriptNode = vlmIn.audioContext.createScriptProcessor(2048, 1, 1);
    vlmIn.analyser.connect(vlmIn.javascriptNode);
    vlmIn.javascriptNode.connect(vlmIn.audioContext.destination);

    vlmIn.freqArray = new Uint8Array(vlmIn.analyser.frequencyBinCount);

    //Connect function that analyses audio
    vlmIn.javascriptNode.onaudioprocess = vlmIn.analyseAudio;
}


////////////////// vlmSpectrum //////////////////////////

var vlmSpectrum = {
    width: 1000,
    height: 200,
    canvasContext: null,
    barWidth: 2
}

vlmSpectrum.init = function() {
    $("#spectrumCanvas").attr("width", vlmSpectrum.width);
    $("#spectrumCanvas").attr("height", vlmSpectrum.height);
    $("#spectrumContainer").css("height", vlmSpectrum.height);
    $("#spectrumContainer").css("width", vlmSpectrum.width);


    vlmSpectrum.canvasContext = $("#spectrumCanvas").get()[0].getContext("2d");

    // create a gradient for the fill
    vlmSpectrum.gradient = vlmSpectrum.canvasContext.createLinearGradient(0,0,0,vlmSpectrum.height);
    vlmSpectrum.gradient.addColorStop(0,'#000000');
    vlmSpectrum.gradient.addColorStop(0.25,'#ff0000');
    vlmSpectrum.gradient.addColorStop(0.75,'#ffff00');
    vlmSpectrum.gradient.addColorStop(1,'#ffffff');

    vlmSpectrum.canvasContext.fillStyle=vlmSpectrum.gradient;

    vlmSpectrum.initGui();
}

vlmSpectrum.initGui = function() {
    var options = {
        'min': 15,
        'max': 50,
        'displayInput': false,
        'width': 70,
        'height': 70,
        'fgColor': "#ffff00",
        'bgColor': "#222",
        'angleArc': 340,
        'change' : function (v) { vlmSpectrum.barWidth = v/10 }
    };

    $("#zoomBass .dial").knob(options);
    $('#zoomBass .dial')
    .val(20)
    .trigger('change');

    options.min = 0.0;
    options.max = 1.0;
    options.step = 0.01;
    options.change = function (v) { vlmIn.timeSmooth = v }

    $("#smooth .dial").knob(options);
    $('#smooth .dial')
    .val(vlmIn.timeSmooth)
    .trigger('change');

}

vlmSpectrum.getNormFromAnalyser = function(analyserValue) {
    return analyserValue / 256.0;
}

vlmSpectrum.getYPosFromValue = function(analyserValue) {
    //Nomalize spectrum value
    var normV = vlmSpectrum.getNormFromAnalyser(analyserValue);
    
    //Calculate y position - the top of the spectrum bar
    return vlmSpectrum.height - (normV * vlmSpectrum.height);
}

// Draws spectrum and the output volumeter
vlmSpectrum.drawSpectrum = function(array) {
    // clear the canvas
    vlmSpectrum.canvasContext.clearRect(0, 0, 1000, 325);

    var x = 0;
    var meterSum = [];

    for ( var i = 0; i < (array.length); i++ ){
        var y = vlmSpectrum.getYPosFromValue(array[i]);

        //Calculate the volumeter
        if (vlmArea.barIsWithinArea(x, y, vlmSpectrum.barWidth)) {
                var add = vlmArea.calculateAreaValue(y);
                meterSum.push(add);
        }

        x += vlmSpectrum.barWidth;

        vlmSpectrum.canvasContext.fillRect(x, y, vlmSpectrum.barWidth*0.8, vlmSpectrum.height)

    }
    vlmMeter.normVol = vlm.getAverageVolume(meterSum, 0);
}


////////////////// vlmArea //////////////////////////
// The user selected area of the spectrum

var vlmArea = {
    width: vlmSpectrum.width/2,
    height: vlmSpectrum.height/2,
    position: {top: 10,left: 0}
}

vlmArea.init = function() {
    $( "#vlmArea" ).width(vlmArea.width);
    $( "#vlmArea" ).height(vlmArea.height);

    $( "#vlmArea" ).resizable({
        containment: $('#spectrumContainer'),
        handles: "all",
        stop: function(event, ui) {
            var w = $(this).width();
            var h = $(this).height();
            //console.log('w', w, "h", h); 
            //Size excluding the border
            vlmArea.width = w;
            vlmArea.height = h;
            vlmArea.position.left = ui.position.left;
            vlmArea.position.top = ui.position.top;

        }
    });

    $( "#vlmArea" ).draggable({
        containment: $('#spectrumContainer'),
        stop: function(event, ui){
            //console.log(ui.position.top, ui.position.left)
            //position relative to the container
            vlmArea.position.left = ui.position.left;
            vlmArea.position.top = ui.position.top;
        }
   });
}

// Note that we do not need to check if the spectrum bar is 
// sticking out above the top of the area, only that the bar is high enough
// to stick into the area.
vlmArea.barIsWithinArea = function(x, y, barWidth) {
    var areaBottom = vlmArea.position.top+vlmArea.height;
    if (x >= vlmArea.position.left && 
        x+barWidth <= vlmArea.position.left + vlmArea.width &&
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
    var val = 1-((spectrumBarY-vlmArea.position.top)/vlmArea.height);
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
    vlmMeter.meterContext = $("#meter").get()[0].getContext("2d");
    $("#meter").attr("width", vlmMeter.width);
    $("#meter").attr("height", vlmMeter.height);    

    vlmMeter.gradient = vlmMeter.meterContext.createLinearGradient(0,0,0,$("#meter").attr("height"));
    vlmMeter.gradient.addColorStop(0,'#aa0000');
    vlmMeter.gradient.addColorStop(0.25,'#ff0000');
    vlmMeter.gradient.addColorStop(0.75,'#ffff00');
    vlmMeter.gradient.addColorStop(1,'#ffffff');

    vlmMeter.initGui();
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
       'change' : vlmMeter.onAmplifyChange
    };

    $("#amplify .dial").knob(options);
    $('#amplify .dial')
    .val(vlmMeter.amplifyValue)
    .trigger('change');

    options.min = 0;
    options.max = 1;
    options.change = vlmMeter.onLiftChange;

    $("#lift .dial").knob(options);
    $('#lift .dial')
    .val(vlmMeter.liftValue)
    .trigger('change');
}

vlmMeter.onAmplifyChange = function(v) {
    vlmMeter.amplifyValue = v;
}

vlmMeter.onLiftChange = function(v) {
    vlmMeter.liftValue = v;
}

vlmMeter.calcVolume = function() {
    vlmMeter.outputVol = (vlmMeter.amplifyValue * vlmMeter.normVol) + vlmMeter.liftValue;
    vlmMeter.outputVol = vlmMeter.outputVol > 1 ? 1 : vlmMeter.outputVol; //Cap value at 1
}


vlmMeter.drawVolumeter = function() {
    vlmMeter.calcVolume();

    // clear the current state
    vlmMeter.meterContext.clearRect(0, 0, 25, $("#meter").attr("height"));

    // set the fill style
    vlmMeter.meterContext.fillStyle=vlmSpectrum.gradient;
    var top = vlmMeter.height-(vlmMeter.outputVol*vlmMeter.height);
    // create the meters
    vlmMeter.meterContext.fillRect(0,top,vlmMeter.width,vlmMeter.height);
    //Draw 'lift' area
    vlmMeter.meterContext.fillStyle = "#ffffff";
    var liftTop = vlmMeter.height-(vlmMeter.liftValue*vlmMeter.height);
    vlmMeter.meterContext.fillRect(0,liftTop,vlmMeter.width,vlmMeter.height);

}