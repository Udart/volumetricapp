
(function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
(i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
})(window,document,'script','https://www.google-analytics.com/analytics.js','ga');

ga('create', 'UA-51025809-3', 'auto');
ga('send', 'pageview');


if (require == "function") {
	var dimensionValue = 'nwjs-app';
	ga('set', 'dimension1', dimensionValue);
} else {
	var dimensionValue = 'online';
	ga('set', 'dimension2', dimensionValue);
}