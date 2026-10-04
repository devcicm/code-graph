using System;
using Acme.Api.Services;
namespace Acme.Api.Controllers
{
    [Route("api/[controller]")]
    public class OrdersController
    {
        [HttpGet("{id}")]
        public object Get(int id) { var t = Type.GetType("Acme.Api.Models.Order"); return Activator.CreateInstance(t); }
    }
}
