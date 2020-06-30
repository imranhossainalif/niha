// JavaScript Document
	(function($) {
    $.fn.countTo = function(options) {
        // merge the default plugin settings with the custom options
        options = $.extend({}, $.fn.countTo.defaults, options || {});
        // how many times to update the value, and how much to increment the value on each update
        var loops = Math.ceil(options.speed / options.refreshInterval),
            increment = (options.to - options.from) / loops;
        return $(this).each(function() {
            var _this = this,
                loopCount = 0,
                value = options.from,
                interval = setInterval(updateTimer, options.refreshInterval);
            function updateTimer() {
                value += increment;
                loopCount++;
                $(_this).html(value.toFixed(options.decimals));
                if (typeof(options.onUpdate) == 'function') {
                    options.onUpdate.call(_this, value);
                }
                if (loopCount >= loops) {
                    clearInterval(interval);
                    value = options.to;
                    if (typeof(options.onComplete) == 'function') {
                        options.onComplete.call(_this, value);
                    }
                }
            }
        });
    };
    $.fn.countTo.defaults = {
        from: 0,  // the number the element should start at
        to: 100,  // the number the element should end at
        speed: 5000,  // how long it should take to count between the target numbers
        refreshInterval: 1000,  // how often the element should be updated
        decimals: 0,  // the number of decimal places to show
        onUpdate: null,  // callback method for every time the element is updated,
        onComplete: null  // callback method for when the element finishes updating
    };
	})(jQuery);
	
	/*Settings of Counters*/
	
	jQuery(function($) {
		count_started = false;
		$('#counters').waypoint(function(direction) {
			if (count_started == false) {
				var count1 = $("#count1").val();
				var count2 = $("#count2").val();
				var count3 = $("#count3").val();
				var count4 = $("#count4").val();
			$('.count1').countTo({
				from: 0,
				to: count1,
				refreshInterval: 50,
				onComplete: function(value) {
					console.debug(this);
				}
			});
			$('.count2').countTo({
				from: 0,
				to: count2,
				refreshInterval: 50,
				onComplete: function(value) {
					console.debug(this);
				}
			});
			$('.count3').countTo({
				from: 0,
				to: count3,
				refreshInterval: 50,
				onComplete: function(value) {
					console.debug(this);
				}
			});
			$('.count4').countTo({
				from: 0,
				to: count4,
				refreshInterval: 50,
				onComplete: function(value) {
					console.debug(this);
				}
			});
			$('.count5').countTo({
				from: 0,
				to: 2500,
				refreshInterval: 50,
				onComplete: function(value) {
					console.debug(this);
				}
			});
			
			$('.count6').countTo({
				from: 0,
				to: 123,
				refreshInterval: 50,
				onComplete: function(value) {
					console.debug(this);
				}
			});
		
			count_started = true;
			}
		}, {
				offset: function() {
					return $.waypoints('viewportHeight') - $(this).height() + 100;
				}
			});
		
    });