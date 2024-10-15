
(()=>
    {

        let itemCount = document.querySelectorAll('section > div').length;
        let activeIndex = 2;


        const getElementIndex = index =>
        {
            return document.querySelector(`section > div:nth-of-type(${index})`);
        }


        const resetStyles = ()=>
        {
            document.querySelector('.prev')?.classList.remove('prev');
            document.querySelector('.active')?.classList.remove('active');
            document.querySelector('.next')?.classList.remove('next');
        }


        const advanceSlideshow = ()=>
        {
            if(activeIndex === itemCount) return;

            resetStyles();

            //active becomes previous
            let active = getElementIndex(activeIndex);
            active.classList.add('prev');

            //next becomes active
            let next = getElementIndex(activeIndex+1);
            next.classList.add('active');

            if(activeIndex <= itemCount)
            {
                getElementIndex(++activeIndex+1).classList.add('next');
            }
        }


        const rewindSlideshow = ()=>
        {
            if(activeIndex === 1) return;

            resetStyles();

            //active becomes next
            let active = getElementIndex(activeIndex);
            active.classList.add('next');

            //previous becomes active
            let prev = getElementIndex(activeIndex-1);
            prev.classList.add('active');

            if(activeIndex >= 2)
            {
                getElementIndex(--activeIndex-1).classList.add('prev');
            }
        }


        const playVideo = ()=>
        {
            const video = document.querySelector('video');
            if(!video) return;

            if (video.paused)

                video.play();
             else
                video.pause();
        }


        document.addEventListener('keyup', e=>
        {
            if(e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== ' ')
                return;

            e.preventDefault();

            e.key === 'ArrowRight' && advanceSlideshow();
            e.key === 'ArrowLeft' && rewindSlideshow();
            e.key === ' ' && playVideo(e);

        })

    })()